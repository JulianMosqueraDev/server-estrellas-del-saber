import { z } from "zod";

const EnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z
      .string()
      .url()
      .refine(
        (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
        "Expected a PostgreSQL connection URL",
      ),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
    AUTH_JWT_SECRET: z
      .string()
      .min(32)
      .default("local-development-only-change-this-placeholder-secret-before-deployment"),
    AUTH_JWT_PREVIOUS_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    AUTH_JWT_ISSUER: z.string().url().default("http://localhost:3001"),
    AUTH_JWT_AUDIENCE: z.string().min(1).max(200).default("estrellas-del-saber-web"),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(900).default(600),
    AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(10),
    AUTH_REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(200).default(20),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    WEB_ORIGIN: z
      .string()
      .url()
      .refine((value) => new URL(value).origin === value, "Expected an origin without a path")
      .default("http://localhost:3000"),
    AUTH_COOKIE_SAME_SITE: z.enum(["lax", "none"]).default("lax"),
  })
  .superRefine((config, context) => {
    if (config.AUTH_COOKIE_SAME_SITE === "none" && config.NODE_ENV !== "production") {
      context.addIssue({
        code: "custom",
        path: ["AUTH_COOKIE_SAME_SITE"],
        message: "SameSite=None requires Secure cookies and is supported only in production",
      });
    }
    if (config.NODE_ENV !== "production") return;

    const secretBytes = Buffer.from(config.AUTH_JWT_SECRET, "base64url");
    if (
      secretBytes.byteLength < 32 ||
      !/^[A-Za-z0-9_-]{43,}$/.test(config.AUTH_JWT_SECRET) ||
      config.AUTH_JWT_SECRET ===
        "local-development-only-change-this-placeholder-secret-before-deployment"
    ) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_JWT_SECRET"],
        message: "Production JWT key must be at least 32 random bytes encoded as base64url",
      });
    }
    if (config.AUTH_JWT_PREVIOUS_SECRET) {
      const previousSecretBytes = Buffer.from(config.AUTH_JWT_PREVIOUS_SECRET, "base64url");
      if (
        previousSecretBytes.byteLength < 32 ||
        !/^[A-Za-z0-9_-]{43,}$/.test(config.AUTH_JWT_PREVIOUS_SECRET) ||
        config.AUTH_JWT_PREVIOUS_SECRET === config.AUTH_JWT_SECRET
      ) {
        context.addIssue({
          code: "custom",
          path: ["AUTH_JWT_PREVIOUS_SECRET"],
          message: "Previous production JWT key must be a distinct 32-byte base64url secret",
        });
      }
    }
    if (!config.WEB_ORIGIN.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGIN"],
        message: "Production web origin must use HTTPS",
      });
    }
    if (!config.AUTH_JWT_ISSUER.startsWith("https://")) {
      context.addIssue({
        code: "custom",
        path: ["AUTH_JWT_ISSUER"],
        message: "Production token issuer must use HTTPS",
      });
    }
  });

export type AppConfig = {
  readonly environment: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly databaseConnectionTimeoutMs: number;
  readonly authJwtSecret: string;
  readonly authJwtPreviousSecret: string | undefined;
  readonly authJwtIssuer: string;
  readonly authJwtAudience: string;
  readonly authAccessTokenTtlSeconds: number;
  readonly authRefreshTokenTtlSeconds: number;
  readonly authLoginRateLimitMax: number;
  readonly authRefreshRateLimitMax: number;
  readonly authRateLimitWindowSeconds: number;
  readonly webOrigin: string;
  readonly authCookieSameSite: "lax" | "none";
};

export class ConfigurationError extends Error {
  constructor(variableNames: readonly string[]) {
    super(`Invalid environment configuration: ${variableNames.join(", ")}.`);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvironmentSchema.safeParse(source);

  if (!parsed.success) {
    const variableNames = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))];
    throw new ConfigurationError(variableNames);
  }

  return {
    environment: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    logLevel: parsed.data.LOG_LEVEL,
    databaseUrl: parsed.data.DATABASE_URL,
    databasePoolMax: parsed.data.DATABASE_POOL_MAX,
    databaseConnectionTimeoutMs: parsed.data.DATABASE_CONNECTION_TIMEOUT_MS,
    authJwtSecret: parsed.data.AUTH_JWT_SECRET,
    authJwtPreviousSecret: parsed.data.AUTH_JWT_PREVIOUS_SECRET,
    authJwtIssuer: parsed.data.AUTH_JWT_ISSUER,
    authJwtAudience: parsed.data.AUTH_JWT_AUDIENCE,
    authAccessTokenTtlSeconds: parsed.data.AUTH_ACCESS_TOKEN_TTL_SECONDS,
    authRefreshTokenTtlSeconds: parsed.data.AUTH_REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
    authLoginRateLimitMax: parsed.data.AUTH_LOGIN_RATE_LIMIT_MAX,
    authRefreshRateLimitMax: parsed.data.AUTH_REFRESH_RATE_LIMIT_MAX,
    authRateLimitWindowSeconds: parsed.data.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    webOrigin: parsed.data.WEB_ORIGIN,
    authCookieSameSite: parsed.data.AUTH_COOKIE_SAME_SITE,
  };
}
