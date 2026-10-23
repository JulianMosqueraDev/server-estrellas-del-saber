import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IdentitySecurity } from "../../application/ports/identity-security";

const ARGON2ID_PARAMETERS = {
  algorithm: "argon2id" as const,
  memoryCost: 65_536,
  timeCost: 2,
};

export class BunIdentitySecurity implements IdentitySecurity {
  private readonly signingKey: Uint8Array;
  private readonly verificationKeys: readonly Uint8Array[];
  private readonly jose = import("jose");

  constructor(
    secret: string,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly accessTokenTtlSeconds: number,
    previousSecret?: string,
  ) {
    if (new TextEncoder().encode(secret).byteLength < 32) {
      throw new Error("The configured JWT signing key is too short.");
    }
    this.signingKey = new TextEncoder().encode(secret);
    this.verificationKeys = [
      this.signingKey,
      ...(previousSecret ? [new TextEncoder().encode(previousSecret)] : []),
    ];
  }

  hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password, ARGON2ID_PARAMETERS);
  }

  verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return Bun.password.verify(password, passwordHash, "argon2id");
  }

  createRefreshToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashRefreshToken(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  createId(): string {
    return randomUUID();
  }

  async issueAccessToken(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly issuedAtSeconds: number;
  }): Promise<string> {
    const { SignJWT } = await this.jose;
    return new SignJWT({ sid: input.sessionId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(input.userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(input.issuedAtSeconds)
      .setExpirationTime(input.issuedAtSeconds + this.accessTokenTtlSeconds)
      .setJti(randomUUID())
      .sign(this.signingKey);
  }

  async verifyAccessToken(token: string) {
    const { jwtVerify } = await this.jose;
    for (const key of this.verificationKeys) {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ["HS256"],
          issuer: this.issuer,
          audience: this.audience,
          maxTokenAge: `${this.accessTokenTtlSeconds}s`,
          requiredClaims: ["sub", "sid", "iat", "exp", "jti"],
        });

        if (
          typeof payload.sub === "string" &&
          typeof payload.sid === "string" &&
          typeof payload.iat === "number" &&
          typeof payload.exp === "number" &&
          typeof payload.jti === "string"
        ) {
          return { userId: payload.sub, sessionId: payload.sid };
        }
      } catch {
        continue;
      }
    }
    return null;
  }
}
