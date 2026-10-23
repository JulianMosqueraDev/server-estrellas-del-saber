import { describe, expect, test } from "bun:test";
import { BunIdentitySecurity } from "../src/modules/identity/infrastructure/crypto/bun-identity-security";

const signingKey = "unit-test-jwt-signing-key-with-more-than-32-bytes";

describe("Bun identity security adapter", () => {
  test("hashes passwords with Argon2id and verifies without manual comparison", async () => {
    const security = new BunIdentitySecurity(signingKey, "https://issuer.example", "web", 300);
    const hash = await security.hashPassword("A secure local test password");

    expect(hash).toStartWith("$argon2id$");
    expect(await security.verifyPassword("A secure local test password", hash)).toBe(true);
    expect(await security.verifyPassword("a different password", hash)).toBe(false);
  });

  test("issues and validates short-lived HS256 tokens with issuer and audience", async () => {
    const security = new BunIdentitySecurity(signingKey, "https://issuer.example", "web", 300);
    const issuedAtSeconds = Math.floor(Date.now() / 1000);
    const token = await security.issueAccessToken({
      userId: "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
      sessionId: "ab1348cc-03a7-4073-915a-000000000001",
      issuedAtSeconds,
    });

    expect(await security.verifyAccessToken(token)).toEqual({
      userId: "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
      sessionId: "ab1348cc-03a7-4073-915a-000000000001",
    });

    const differentKey = new BunIdentitySecurity(
      "a-different-jwt-signing-key-with-more-than-32-bytes",
      "https://issuer.example",
      "web",
      300,
    );
    expect(await differentKey.verifyAccessToken(token)).toBeNull();
    expect(await security.verifyAccessToken(`${token}tampered`)).toBeNull();
  });

  test("rejects tokens outside the configured maximum age", async () => {
    const security = new BunIdentitySecurity(signingKey, "https://issuer.example", "web", 300);
    const token = await security.issueAccessToken({
      userId: "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
      sessionId: "ab1348cc-03a7-4073-915a-000000000001",
      issuedAtSeconds: Math.floor(Date.now() / 1000) - 600,
    });

    expect(await security.verifyAccessToken(token)).toBeNull();
  });

  test("accepts the previous signing key only during the configured rotation window", async () => {
    const oldKey = "previous-jwt-signing-key-with-more-than-32-bytes";
    const oldSigner = new BunIdentitySecurity(oldKey, "https://issuer.example", "web", 300);
    const previousToken = await oldSigner.issueAccessToken({
      userId: "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
      sessionId: "ab1348cc-03a7-4073-915a-000000000001",
      issuedAtSeconds: Math.floor(Date.now() / 1000),
    });
    const rotatingVerifier = new BunIdentitySecurity(
      signingKey,
      "https://issuer.example",
      "web",
      300,
      oldKey,
    );

    expect(await rotatingVerifier.verifyAccessToken(previousToken)).not.toBeNull();
    expect(
      await new BunIdentitySecurity(
        signingKey,
        "https://issuer.example",
        "web",
        300,
      ).verifyAccessToken(previousToken),
    ).toBeNull();
  });

  test("creates a high-entropy opaque refresh token and stores only a digest", () => {
    const security = new BunIdentitySecurity(signingKey, "https://issuer.example", "web", 300);
    const token = security.createRefreshToken();
    const digest = security.hashRefreshToken(token);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toBe(token);
  });
});
