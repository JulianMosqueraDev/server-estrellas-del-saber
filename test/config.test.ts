import { describe, expect, test } from "bun:test";
import { ConfigurationError, loadConfig } from "../src/shared/config/env";

describe("loadConfig", () => {
  test("parses required PostgreSQL configuration and safe defaults", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://local:secret@localhost:5432/school",
      AUTH_JWT_SECRET: "local-test-secret-longer-than-32-characters",
    });

    expect(config.port).toBe(3001);
    expect(config.host).toBe("127.0.0.1");
    expect(config.databasePoolMax).toBe(5);
    expect(config.databaseUrl).toContain("secret");
    expect(config.authAccessTokenTtlSeconds).toBe(600);
    expect(config.authRefreshTokenTtlSeconds).toBe(30 * 24 * 60 * 60);
    expect(config.webOrigin).toBe("http://localhost:3000");
    expect(config.authCookieSameSite).toBe("lax");
  });

  test("reports invalid variable names without echoing values", () => {
    const secret = "sensitive-value-that-must-not-be-echoed";

    try {
      loadConfig({
        DATABASE_URL: secret,
        AUTH_JWT_SECRET: "local-test-secret-longer-than-32-characters",
      });
      throw new Error("Expected invalid configuration to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toContain("DATABASE_URL");
      expect((error as Error).message).not.toContain(secret);
    }
  });

  test("requires a secret and HTTPS origins in production", () => {
    try {
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://local:secret@localhost:5432/school",
        AUTH_JWT_SECRET: "local-development-only-change-this-placeholder-secret-before-deployment",
      });
      throw new Error("Expected invalid production security configuration to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toContain("AUTH_JWT_SECRET");
      expect((error as Error).message).toContain("WEB_ORIGIN");
    }
  });

  test("allows SameSite=None only with production secure-cookie configuration", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://local:secret@localhost:5432/school",
      AUTH_JWT_SECRET: "A".repeat(43),
      AUTH_JWT_ISSUER: "https://api.example.com",
      WEB_ORIGIN: "https://school.example.com",
      AUTH_COOKIE_SAME_SITE: "none",
    });
    expect(config.authCookieSameSite).toBe("none");

    expect(() =>
      loadConfig({
        DATABASE_URL: "postgresql://local:secret@localhost:5432/school",
        AUTH_COOKIE_SAME_SITE: "none",
      }),
    ).toThrow(ConfigurationError);
  });
});
