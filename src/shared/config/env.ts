import { z } from "zod";

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z
    .string()
    .url()
    .refine(
      (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
      "Expected a PostgreSQL connection URL",
    ),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(2_000),
});

export type AppConfig = {
  readonly environment: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  readonly databaseUrl: string;
  readonly databasePoolMax: number;
  readonly databaseConnectionTimeoutMs: number;
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
  };
}
