import { describe, expect, test } from "bun:test";
import { ConfigurationError, loadConfig } from "../src/shared/config/env";

describe("loadConfig", () => {
  test("parses required PostgreSQL configuration and safe defaults", () => {
    const config = loadConfig({ DATABASE_URL: "postgresql://local:secret@localhost:5432/school" });

    expect(config.port).toBe(3001);
    expect(config.host).toBe("127.0.0.1");
    expect(config.databasePoolMax).toBe(5);
    expect(config.databaseUrl).toContain("secret");
  });

  test("reports invalid variable names without echoing values", () => {
    const secret = "sensitive-value-that-must-not-be-echoed";

    try {
      loadConfig({ DATABASE_URL: secret });
      throw new Error("Expected invalid configuration to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).toContain("DATABASE_URL");
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
