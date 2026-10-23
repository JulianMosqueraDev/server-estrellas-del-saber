import { describe, expect, test } from "bun:test";
import { HttpApplicationError } from "../src/shared/domain/errors/application-error";
import { createIdentityApplication } from "../src/modules/identity/application/identity-application";
import { BunIdentitySecurity } from "../src/modules/identity/infrastructure/crypto/bun-identity-security";
import { createIdentityHarness } from "./support/identity-fixtures";

const audit = { ipAddress: "127.0.0.1", userAgent: "unit-test" };

describe("identity application", () => {
  test("normalizes email and creates a session for an active user", async () => {
    const harness = createIdentityHarness();

    const result = await harness.application.login({ ...harness.loginBody, audit });

    expect(result.user.email).toBe("admin@example.com");
    expect(result.expiresIn).toBe(600);
    expect(result.refreshToken).toMatch(/^refresh-token-/);
    expect(harness.repository.sessions.size).toBe(1);
    expect([...harness.repository.sessions.keys()][0]).not.toBe(result.refreshToken);
  });

  test("returns the same public login error for unknown and incorrect credentials", async () => {
    const harness = createIdentityHarness();
    const errors: unknown[] = [];

    for (const input of [
      { email: "missing@example.com", password: "Wrong-Password-123" },
      { email: "admin@example.com", password: "Wrong-Password-123" },
    ]) {
      try {
        await harness.application.login({ ...input, audit });
      } catch (error) {
        errors.push(error);
      }
    }

    expect(errors).toHaveLength(2);
    expect(errors[0]).toBeInstanceOf(HttpApplicationError);
    expect((errors[0] as HttpApplicationError).code).toBe("INVALID_CREDENTIALS");
    expect((errors[1] as HttpApplicationError).code).toBe("INVALID_CREDENTIALS");
    expect(harness.repository.loginFailures).toEqual([
      null,
      "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
    ]);
  });

  test("does not sign in a disabled account", async () => {
    const harness = createIdentityHarness({ accountStatus: "disabled" });

    await expect(harness.application.login({ ...harness.loginBody, audit })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
    expect(harness.repository.sessions.size).toBe(0);
  });

  test("uses a valid Argon2id dummy hash for an unknown email", async () => {
    const harness = createIdentityHarness();
    const application = createIdentityApplication({
      repository: harness.repository,
      security: new BunIdentitySecurity(
        "unit-test-jwt-signing-key-with-more-than-32-bytes",
        "https://issuer.example",
        "web",
        600,
      ),
      accessTokenTtlSeconds: 600,
      refreshTokenTtlSeconds: 3600,
    });

    await expect(
      application.login({ email: "unknown@example.com", password: "arbitrary-password", audit }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS", statusCode: 401 });
  });

  test("rotates a refresh token and revokes its family when the old token is reused", async () => {
    const harness = createIdentityHarness();
    const loggedIn = await harness.application.login({ ...harness.loginBody, audit });
    const refreshed = await harness.application.refresh({
      refreshToken: loggedIn.refreshToken,
      audit,
    });

    expect(refreshed.refreshToken).not.toBe(loggedIn.refreshToken);
    await expect(
      harness.application.refresh({ refreshToken: loggedIn.refreshToken, audit }),
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", statusCode: 401 });
    await expect(
      harness.application.refresh({ refreshToken: refreshed.refreshToken, audit }),
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", statusCode: 401 });
  });

  test("logout is idempotent and ignores unknown refresh tokens", async () => {
    const harness = createIdentityHarness();
    const loggedIn = await harness.application.login({ ...harness.loginBody, audit });

    await harness.application.logout({ refreshToken: loggedIn.refreshToken, audit });
    await harness.application.logout({ refreshToken: loggedIn.refreshToken, audit });
    await harness.application.logout({ refreshToken: "unknown", audit });

    expect(harness.repository.sessions.size).toBe(0);
  });

  test("does not allow the bootstrap operation to accept a short password", async () => {
    const harness = createIdentityHarness();

    await expect(
      harness.application.createFirstAdministrator({
        email: "new@example.com",
        fullName: "Initial Administrator",
        password: "short",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ADMIN_PASSWORD", statusCode: 400 });
    expect(harness.repository.credentials.has("new@example.com")).toBe(false);
  });

  test("administrator recovery changes the password hash and revokes active sessions", async () => {
    const harness = createIdentityHarness();
    const loggedIn = await harness.application.login({ ...harness.loginBody, audit });

    await harness.application.recoverAdministrator({
      email: " ADMIN@EXAMPLE.COM ",
      password: "A new secure passphrase",
    });

    expect(harness.repository.credentials.get("admin@example.com")?.passwordHash).toBe(
      "hash:A new secure passphrase",
    );
    const activeSession = [...harness.repository.sessions.values()].find(
      (session) => session.userId === "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
    );
    expect(activeSession?.revokedAt).toBeInstanceOf(Date);
    expect(loggedIn.refreshToken).not.toBe(activeSession?.refreshTokenHash);
  });

  test("blocks refresh after the account is disabled", async () => {
    const harness = createIdentityHarness();
    const loggedIn = await harness.application.login({ ...harness.loginBody, audit });
    const credential = harness.repository.credentials.get("admin@example.com")!;
    harness.repository.credentials.set("admin@example.com", { ...credential, status: "disabled" });

    await expect(
      harness.application.refresh({ refreshToken: loggedIn.refreshToken, audit }),
    ).rejects.toMatchObject({ code: "INVALID_REFRESH_TOKEN", statusCode: 401 });
    expect([...harness.repository.sessions.values()][0]?.revokedAt).toBeInstanceOf(Date);
  });
});
