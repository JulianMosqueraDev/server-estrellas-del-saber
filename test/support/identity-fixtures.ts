import { createHash } from "node:crypto";
import type {
  AuthorizationProfile,
  IdentityRepository,
  NewIdentitySession,
  PasswordCredential,
  RefreshRotationInput,
} from "../../src/modules/identity/application/ports/identity-repository";
import type {
  AccessTokenClaims,
  IdentitySecurity,
} from "../../src/modules/identity/application/ports/identity-security";
import { createIdentityApplication } from "../../src/modules/identity/application/identity-application";

const TEST_USER = {
  id: "45fd8383-f28a-4cc8-9fb8-5cf68d3acd31",
  email: "admin@example.com",
  fullName: "Estrellas Admin",
};

type MemorySession = NewIdentitySession & { revokedAt: Date | null };

export class FakeIdentityRepository implements IdentityRepository {
  readonly credentials = new Map<string, PasswordCredential>([
    [TEST_USER.email, { ...TEST_USER, passwordHash: "hash:Correct-Horse-123", status: "active" }],
  ]);
  readonly profiles = new Map<string, AuthorizationProfile>([
    [
      TEST_USER.id,
      {
        ...TEST_USER,
        roles: ["super_admin"],
        permissions: ["admin.access", "users.read"],
      },
    ],
  ]);
  readonly sessions = new Map<string, MemorySession>();
  readonly tokenHistory = new Map<string, MemorySession>();
  readonly loginFailures: (string | null)[] = [];

  async findCredentialsByEmail(email: string) {
    return this.credentials.get(email) ?? null;
  }

  async recordLoginFailure(userId: string | null) {
    this.loginFailures.push(userId);
  }

  async createSession(session: NewIdentitySession) {
    this.sessions.set(session.refreshTokenHash, { ...session, revokedAt: null });
  }

  async rotateRefreshToken(input: RefreshRotationInput) {
    const current = this.sessions.get(input.previousTokenHash);
    if (!current) {
      const historical = this.tokenHistory.get(input.previousTokenHash);
      if (!historical) return { status: "invalid" as const };
      historical.revokedAt = input.now;
      for (const [hash, session] of this.sessions) {
        if (session.id === historical.id) {
          session.revokedAt = input.now;
          this.sessions.delete(hash);
        }
      }
      return { status: "reused" as const };
    }
    if (current.revokedAt || current.expiresAt <= input.now) {
      return { status: "invalid" as const };
    }
    const profile = this.profiles.get(current.userId);
    const credential = [...this.credentials.values()].find((value) => value.id === current.userId);
    if (credential?.status !== "active" || !profile) {
      current.revokedAt = input.now;
      return { status: "disabled" as const };
    }

    this.sessions.delete(input.previousTokenHash);
    this.tokenHistory.set(input.previousTokenHash, current);
    const rotated = {
      ...current,
      refreshTokenHash: input.replacementTokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    this.sessions.set(input.replacementTokenHash, rotated);
    return {
      status: "rotated" as const,
      sessionId: current.id,
      user: { id: profile.id, email: profile.email, fullName: profile.fullName },
    };
  }

  async revokeSessionByRefreshToken(tokenHash: string) {
    const session = this.sessions.get(tokenHash) ?? this.tokenHistory.get(tokenHash);
    if (!session) return;
    session.revokedAt = new Date();
    this.sessions.delete(session.refreshTokenHash);
  }

  async findAuthorizationProfile(userId: string) {
    const profile = this.profiles.get(userId);
    const credential = [...this.credentials.values()].find((value) => value.id === userId);
    if (credential?.status !== "active" || !profile) return null;
    return profile;
  }

  async createFirstAdministrator(input: {
    readonly id: string;
    readonly email: string;
    readonly passwordHash: string;
    readonly fullName: string;
  }) {
    if ([...this.profiles.values()].some((profile) => profile.roles.includes("super_admin"))) {
      throw new Error("Administrator already initialized.");
    }
    const user = { id: input.id, email: input.email, fullName: input.fullName };
    this.credentials.set(input.email, {
      ...user,
      passwordHash: input.passwordHash,
      status: "active",
    });
    this.profiles.set(input.id, { ...user, roles: ["super_admin"], permissions: ["admin.access"] });
  }

  async recoverAdministrator(email: string, passwordHash: string) {
    const credential = this.credentials.get(email);
    if (!credential || !this.profiles.get(credential.id)?.roles.includes("super_admin")) {
      throw new Error("No existing super administrator.");
    }
    this.credentials.set(email, { ...credential, passwordHash });
    for (const session of this.sessions.values()) {
      if (session.userId === credential.id) session.revokedAt = new Date();
    }
  }
}

export class FakeIdentitySecurity implements IdentitySecurity {
  private nextId = 0;
  private nextRefreshToken = 0;
  private readonly accessTokens = new Map<string, AccessTokenClaims>();

  async hashPassword(password: string) {
    return `hash:${password}`;
  }

  async verifyPassword(password: string, passwordHash: string) {
    return passwordHash === `hash:${password}`;
  }

  createRefreshToken() {
    this.nextRefreshToken += 1;
    return `refresh-token-${this.nextRefreshToken}`;
  }

  hashRefreshToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
  }

  createId() {
    this.nextId += 1;
    return `ab1348cc-03a7-4073-915a-${String(this.nextId).padStart(12, "0")}`;
  }

  async issueAccessToken(input: AccessTokenClaims) {
    const token = `test-access-token-${input.userId}-${input.sessionId}`;
    this.accessTokens.set(token, input);
    return token;
  }

  async verifyAccessToken(token: string) {
    return this.accessTokens.get(token) ?? null;
  }
}

export function createIdentityHarness(options?: {
  readonly accountStatus?: "active" | "disabled";
  readonly permissions?: readonly string[];
  readonly roles?: readonly string[];
  readonly secureCookie?: boolean;
  readonly loginRateLimitMax?: number;
}) {
  const repository = new FakeIdentityRepository();
  const security = new FakeIdentitySecurity();
  const existing = repository.credentials.get(TEST_USER.email)!;
  repository.credentials.set(TEST_USER.email, {
    ...existing,
    status: options?.accountStatus ?? "active",
  });
  const profile = repository.profiles.get(TEST_USER.id)!;
  repository.profiles.set(TEST_USER.id, {
    ...profile,
    roles: options?.roles ?? profile.roles,
    permissions: options?.permissions ?? profile.permissions,
  });
  const application = createIdentityApplication({
    repository,
    security,
    accessTokenTtlSeconds: 600,
    refreshTokenTtlSeconds: 3600,
    now: () => new Date("2026-10-23T12:00:00.000Z"),
  });

  return {
    repository,
    security,
    application,
    httpConfig: {
      webOrigin: "http://localhost:3000",
      cookieSameSite: "lax" as const,
      secureCookie: options?.secureCookie ?? false,
      refreshTokenTtlSeconds: 3600,
      loginRateLimitMax: options?.loginRateLimitMax ?? 10,
      refreshRateLimitMax: 10,
      rateLimitWindowSeconds: 60,
    },
    loginBody: { email: " Admin@Example.com ", password: "Correct-Horse-123" },
    origin: "http://localhost:3000",
  };
}
