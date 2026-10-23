import { HttpApplicationError } from "../../../shared/domain/errors/application-error";
import type { AuditContext, IdentityRepository, PublicIdentity } from "./ports/identity-repository";
import type { AuthenticatedIdentity, IdentitySecurity } from "./ports/identity-security";

const INVALID_CREDENTIALS = new HttpApplicationError(
  "INVALID_CREDENTIALS",
  "Email or password is incorrect.",
  401,
);
const INVALID_REFRESH_TOKEN = new HttpApplicationError(
  "INVALID_REFRESH_TOKEN",
  "The refresh session is invalid. Sign in again.",
  401,
);
const INVALID_ACCESS_TOKEN = new HttpApplicationError(
  "INVALID_ACCESS_TOKEN",
  "A valid bearer access token is required.",
  401,
);

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=2,p=1$ddbcyBcbAcagei7wSkZFiouX6TqnUQHmTyS5mxGCzeM$+3OIaFatZ3n6LtMhUlfWbgJyNp7h8/oIsLK+LzZO+WI";

export type IdentityApplication = ReturnType<typeof createIdentityApplication>;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createIdentityApplication(dependencies: {
  readonly repository: IdentityRepository;
  readonly security: IdentitySecurity;
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
  readonly now?: () => Date;
}) {
  const now = dependencies.now ?? (() => new Date());

  async function authenticate(accessToken: string): Promise<AuthenticatedIdentity> {
    const claims = await dependencies.security.verifyAccessToken(accessToken);
    if (!claims) throw INVALID_ACCESS_TOKEN;

    const profile = await dependencies.repository.findAuthorizationProfile(claims.userId);
    if (!profile) throw INVALID_ACCESS_TOKEN;

    return {
      user: { id: profile.id, email: profile.email, fullName: profile.fullName },
      sessionId: claims.sessionId,
      roles: profile.roles,
      permissions: profile.permissions,
    };
  }

  return {
    accessTokenTtlSeconds: dependencies.accessTokenTtlSeconds,

    async login(input: {
      readonly email: string;
      readonly password: string;
      readonly audit: AuditContext;
    }) {
      if (new TextEncoder().encode(input.password).byteLength > 128) {
        throw INVALID_CREDENTIALS;
      }

      const email = normalizeEmail(input.email);
      const credential = await dependencies.repository.findCredentialsByEmail(email);
      const isPasswordValid = await dependencies.security.verifyPassword(
        input.password,
        credential?.passwordHash ?? DUMMY_PASSWORD_HASH,
      );

      if (!credential || !isPasswordValid || credential.status !== "active") {
        await dependencies.repository.recordLoginFailure(
          credential?.id ?? null,
          input.audit,
          now(),
        );
        throw INVALID_CREDENTIALS;
      }

      const createdAt = now();
      const sessionId = dependencies.security.createId();
      const refreshToken = dependencies.security.createRefreshToken();
      const expiresAt = new Date(createdAt.getTime() + dependencies.refreshTokenTtlSeconds * 1000);
      const accessToken = await dependencies.security.issueAccessToken({
        userId: credential.id,
        sessionId,
        issuedAtSeconds: Math.floor(createdAt.getTime() / 1000),
      });

      await dependencies.repository.createSession({
        id: sessionId,
        userId: credential.id,
        refreshTokenHash: dependencies.security.hashRefreshToken(refreshToken),
        createdAt,
        expiresAt,
        audit: input.audit,
      });

      return {
        accessToken,
        expiresIn: dependencies.accessTokenTtlSeconds,
        refreshToken,
        user: { id: credential.id, email: credential.email, fullName: credential.fullName },
      };
    },

    async refresh(input: { readonly refreshToken: string; readonly audit: AuditContext }) {
      const rotatedAt = now();
      const nextRefreshToken = dependencies.security.createRefreshToken();
      const result = await dependencies.repository.rotateRefreshToken({
        previousTokenHash: dependencies.security.hashRefreshToken(input.refreshToken),
        replacementTokenHash: dependencies.security.hashRefreshToken(nextRefreshToken),
        now: rotatedAt,
        expiresAt: new Date(rotatedAt.getTime() + dependencies.refreshTokenTtlSeconds * 1000),
        audit: input.audit,
      });

      if (result.status !== "rotated") throw INVALID_REFRESH_TOKEN;

      const accessToken = await dependencies.security.issueAccessToken({
        userId: result.user.id,
        sessionId: result.sessionId,
        issuedAtSeconds: Math.floor(rotatedAt.getTime() / 1000),
      });

      return {
        accessToken,
        expiresIn: dependencies.accessTokenTtlSeconds,
        refreshToken: nextRefreshToken,
      };
    },

    async logout(input: { readonly refreshToken?: string; readonly audit: AuditContext }) {
      if (input.refreshToken) {
        await dependencies.repository.revokeSessionByRefreshToken(
          dependencies.security.hashRefreshToken(input.refreshToken),
          input.audit,
          now(),
        );
      }
    },

    authenticate,

    async getCurrentUser(accessToken: string): Promise<AuthenticatedIdentity> {
      return authenticate(accessToken);
    },

    async createFirstAdministrator(input: {
      readonly email: string;
      readonly fullName: string;
      readonly password: string;
    }): Promise<PublicIdentity> {
      const email = normalizeEmail(input.email);
      const fullName = input.fullName.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpApplicationError("INVALID_ADMIN_EMAIL", "Enter a valid email address.", 400);
      }
      if (fullName.length < 2 || fullName.length > 160) {
        throw new HttpApplicationError("INVALID_ADMIN_NAME", "Enter a valid full name.", 400);
      }
      const passwordLength = new TextEncoder().encode(input.password).byteLength;
      if (passwordLength < 12 || passwordLength > 128) {
        throw new HttpApplicationError(
          "INVALID_ADMIN_PASSWORD",
          "The initial administrator password must contain between 12 and 128 bytes.",
          400,
        );
      }

      const createdAt = now();
      const administrator = {
        id: dependencies.security.createId(),
        email,
        fullName,
      };
      const passwordHash = await dependencies.security.hashPassword(input.password);
      await dependencies.repository.createFirstAdministrator({
        ...administrator,
        passwordHash,
        createdAt,
      });
      return administrator;
    },

    async recoverAdministrator(input: { readonly email: string; readonly password: string }) {
      const email = normalizeEmail(input.email);
      const passwordLength = new TextEncoder().encode(input.password).byteLength;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpApplicationError("INVALID_ADMIN_EMAIL", "Enter a valid email address.", 400);
      }
      if (passwordLength < 12 || passwordLength > 128) {
        throw new HttpApplicationError(
          "INVALID_ADMIN_PASSWORD",
          "The administrator password must contain between 12 and 128 bytes.",
          400,
        );
      }
      await dependencies.repository.recoverAdministrator(
        email,
        await dependencies.security.hashPassword(input.password),
        now(),
      );
    },
  };
}
