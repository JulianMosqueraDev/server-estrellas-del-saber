import { createHash } from "node:crypto";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { HttpApplicationError } from "../../../../shared/domain/errors/application-error";
import { normalizeEmail, type IdentityApplication } from "../../application/identity-application";
import type { AuthenticatedIdentity } from "../../application/ports/identity-security";

export const REFRESH_COOKIE_NAME = "eds_refresh";
const AUTH_PREFIX = "/api/v1/auth";

declare module "fastify" {
  interface FastifyRequest {
    identityContext: AuthenticatedIdentity | null;
  }
}

const ErrorResponseSchema = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});
type RateLimitCheck = ReturnType<FastifyInstance["createRateLimit"]>;
type RateLimitResult = Awaited<ReturnType<RateLimitCheck>>;

const LoginBodySchema = Type.Object(
  {
    email: Type.String({ format: "email", maxLength: 254 }),
    password: Type.String({ minLength: 1, maxLength: 128 }),
  },
  { additionalProperties: false },
);

const PublicUserSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  email: Type.String({ format: "email" }),
  fullName: Type.String(),
});

const TokenResponseSchema = Type.Object({
  accessToken: Type.String(),
  tokenType: Type.Literal("Bearer"),
  expiresIn: Type.Integer({ minimum: 300, maximum: 900 }),
});

const LoginResponseSchema = Type.Object({
  accessToken: Type.String(),
  tokenType: Type.Literal("Bearer"),
  expiresIn: Type.Integer({ minimum: 300, maximum: 900 }),
  user: PublicUserSchema,
});

const CurrentUserSchema = Type.Object({
  user: Type.Object({
    ...PublicUserSchema.properties,
    roles: Type.Array(Type.String()),
    permissions: Type.Array(Type.String()),
  }),
});

export type IdentityHttpConfig = {
  readonly webOrigin: string;
  readonly cookieSameSite: "lax" | "none";
  readonly secureCookie: boolean;
  readonly refreshTokenTtlSeconds: number;
  readonly loginRateLimitMax: number;
  readonly refreshRateLimitMax: number;
  readonly rateLimitWindowSeconds: number;
};

function auditContext(request: FastifyRequest) {
  const userAgent = request.headers["user-agent"];
  return {
    ipAddress: request.ip,
    userAgent: typeof userAgent === "string" ? userAgent.slice(0, 512) : null,
  };
}

function setNoStore(reply: FastifyReply): void {
  reply.header("cache-control", "no-store").header("pragma", "no-cache");
}

function requireAllowedOrigin(request: FastifyRequest, expectedOrigin: string): void {
  if (request.headers.origin !== expectedOrigin) {
    throw new HttpApplicationError(
      "ORIGIN_NOT_ALLOWED",
      "This request origin is not allowed.",
      403,
    );
  }
}

function cookieOptions(config: IdentityHttpConfig) {
  return {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: config.cookieSameSite,
    path: AUTH_PREFIX,
    maxAge: config.refreshTokenTtlSeconds,
  };
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  const match = typeof authorization === "string" ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
  if (!match?.[1]) {
    throw new HttpApplicationError(
      "AUTHENTICATION_REQUIRED",
      "A valid bearer access token is required.",
      401,
    );
  }
  return match[1];
}

function enforceRateLimit(result: RateLimitResult, reply: FastifyReply): void {
  if ("isExceeded" in result && !result.isExceeded) return;
  if (!("isExceeded" in result)) return;
  reply.header("retry-after", String(Math.max(1, result.ttlInSeconds)));
  throw new HttpApplicationError("RATE_LIMITED", "Too many requests. Try again later.", 429);
}

export async function registerIdentityRoutes(
  app: FastifyInstance,
  dependencies: {
    readonly application: IdentityApplication;
    readonly config: IdentityHttpConfig;
  },
): Promise<void> {
  const { application, config } = dependencies;
  app.decorateRequest("identityContext", null);

  const rateWindow = config.rateLimitWindowSeconds * 1000;
  const loginIpRateLimit = app.createRateLimit({
    max: config.loginRateLimitMax,
    timeWindow: rateWindow,
    ipv6Subnet: 64,
  });
  const loginEmailRateLimit = app.createRateLimit({
    max: config.loginRateLimitMax,
    timeWindow: rateWindow,
    keyGenerator: (request) => {
      const body = request.body as { email?: unknown } | undefined;
      const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "invalid";
      const emailDigest = createHash("sha256").update(email, "utf8").digest("hex");
      return `auth:login:email:${emailDigest}`;
    },
  });
  const refreshIpRateLimit = app.createRateLimit({
    max: config.refreshRateLimitMax,
    timeWindow: rateWindow,
    ipv6Subnet: 64,
  });
  const refreshTokenRateLimit = app.createRateLimit({
    max: config.refreshRateLimitMax,
    timeWindow: rateWindow,
    keyGenerator: (request) => {
      const token = request.cookies[REFRESH_COOKIE_NAME];
      if (!token) return `auth:refresh:missing:${request.id}`;
      const tokenHash = createHash("sha256")
        .update(token ?? "", "utf8")
        .digest("hex");
      return `auth:refresh:token:${tokenHash}`;
    },
  });

  const authenticate = async (request: FastifyRequest): Promise<void> => {
    request.identityContext = await application.authenticate(bearerToken(request));
  };
  const requirePermission = (permission: string) => async (request: FastifyRequest) => {
    await authenticate(request);
    if (!request.identityContext?.permissions.includes(permission)) {
      throw new HttpApplicationError(
        "PERMISSION_DENIED",
        "You do not have permission to perform this action.",
        403,
      );
    }
  };

  app.post(
    `${AUTH_PREFIX}/login`,
    {
      schema: {
        tags: ["identity"],
        summary: "Sign in and create a refresh session",
        description:
          "The short-lived access token is returned as JSON. The opaque refresh token is set only in an HttpOnly cookie. Requests must use the configured web Origin.",
        body: LoginBodySchema,
        response: {
          200: LoginResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          429: ErrorResponseSchema,
          413: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        requireAllowedOrigin(request, config.webOrigin);
        const [ipResult, emailResult] = await Promise.all([
          loginIpRateLimit(request),
          loginEmailRateLimit(request),
        ]);
        enforceRateLimit(ipResult, reply);
        enforceRateLimit(emailResult, reply);
      },
    },
    async (request, reply) => {
      setNoStore(reply);
      const body = request.body as { email: string; password: string };
      const result = await application.login({ ...body, audit: auditContext(request) });
      reply.setCookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions(config));
      return {
        accessToken: result.accessToken,
        tokenType: "Bearer" as const,
        expiresIn: result.expiresIn,
        user: result.user,
      };
    },
  );

  app.post(
    `${AUTH_PREFIX}/refresh`,
    {
      schema: {
        tags: ["identity"],
        summary: "Rotate a refresh session",
        description:
          "Consumes the HttpOnly refresh cookie and rotates it atomically. The configured Origin is required for CSRF protection.",
        security: [{ refreshCookie: [] }],
        response: {
          200: TokenResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          429: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        requireAllowedOrigin(request, config.webOrigin);
        const [ipResult, tokenResult] = await Promise.all([
          refreshIpRateLimit(request),
          refreshTokenRateLimit(request),
        ]);
        enforceRateLimit(ipResult, reply);
        enforceRateLimit(tokenResult, reply);
      },
    },
    async (request, reply) => {
      setNoStore(reply);
      const refreshToken = request.cookies[REFRESH_COOKIE_NAME];
      if (!refreshToken) {
        reply.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOptions(config), maxAge: 0 });
        throw new HttpApplicationError(
          "INVALID_REFRESH_TOKEN",
          "The refresh session is invalid. Sign in again.",
          401,
        );
      }

      try {
        const result = await application.refresh({
          refreshToken,
          audit: auditContext(request),
        });
        reply.setCookie(REFRESH_COOKIE_NAME, result.refreshToken, cookieOptions(config));
        return {
          accessToken: result.accessToken,
          tokenType: "Bearer" as const,
          expiresIn: result.expiresIn,
        };
      } catch (error) {
        if (error instanceof HttpApplicationError && error.code === "INVALID_REFRESH_TOKEN") {
          reply.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOptions(config), maxAge: 0 });
        }
        throw error;
      }
    },
  );

  app.post(
    `${AUTH_PREFIX}/logout`,
    {
      schema: {
        tags: ["identity"],
        summary: "Revoke the refresh session",
        description:
          "Revokes the session when its refresh cookie is recognized and clears the cookie. This operation is idempotent. Already-issued access JWTs remain valid until expiry.",
        security: [{ refreshCookie: [] }],
        response: {
          200: Type.Object({ status: Type.Literal("logged_out") }),
          403: ErrorResponseSchema,
          429: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preHandler: async (request, reply) => {
        const result = await refreshIpRateLimit(request);
        enforceRateLimit(result, reply);
        requireAllowedOrigin(request, config.webOrigin);
      },
    },
    async (request, reply) => {
      setNoStore(reply);
      await application.logout({
        refreshToken: request.cookies[REFRESH_COOKIE_NAME],
        audit: auditContext(request),
      });
      reply.clearCookie(REFRESH_COOKIE_NAME, { ...cookieOptions(config), maxAge: 0 });
      return { status: "logged_out" as const };
    },
  );

  app.get(
    `${AUTH_PREFIX}/me`,
    {
      schema: {
        tags: ["identity"],
        summary: "Get the authenticated user and current permissions",
        security: [{ bearerAuth: [] }],
        response: { 200: CurrentUserSchema, 401: ErrorResponseSchema, 500: ErrorResponseSchema },
      },
      preHandler: authenticate,
    },
    async (request) => ({
      user: {
        ...request.identityContext!.user,
        roles: request.identityContext!.roles,
        permissions: request.identityContext!.permissions,
      },
    }),
  );

  app.get(
    "/api/v1/admin/access-check",
    {
      schema: {
        tags: ["identity"],
        summary: "Check access to protected administration features",
        security: [{ bearerAuth: [] }],
        response: {
          200: Type.Object({ access: Type.Literal("granted") }),
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preHandler: requirePermission("admin.access"),
    },
    async () => ({ access: "granted" as const }),
  );
}
