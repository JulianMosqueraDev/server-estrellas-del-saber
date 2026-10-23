export type AccountStatus = "active" | "disabled";

export type PublicIdentity = {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
};

export type PasswordCredential = PublicIdentity & {
  readonly passwordHash: string;
  readonly status: AccountStatus;
};

export type AuthorizationProfile = PublicIdentity & {
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
};

export type AuditContext = {
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
};

export type NewIdentitySession = {
  readonly id: string;
  readonly userId: string;
  readonly refreshTokenHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly audit: AuditContext;
};

export type RefreshRotationInput = {
  readonly previousTokenHash: string;
  readonly replacementTokenHash: string;
  readonly now: Date;
  readonly expiresAt: Date;
  readonly audit: AuditContext;
};

export type RefreshRotationResult =
  | { readonly status: "rotated"; readonly sessionId: string; readonly user: PublicIdentity }
  | { readonly status: "invalid" }
  | { readonly status: "reused" }
  | { readonly status: "disabled" };

export interface IdentityRepository {
  findCredentialsByEmail(email: string): Promise<PasswordCredential | null>;
  recordLoginFailure(userId: string | null, audit: AuditContext, occurredAt: Date): Promise<void>;
  createSession(session: NewIdentitySession): Promise<void>;
  rotateRefreshToken(input: RefreshRotationInput): Promise<RefreshRotationResult>;
  revokeSessionByRefreshToken(
    tokenHash: string,
    audit: AuditContext,
    occurredAt: Date,
  ): Promise<void>;
  findAuthorizationProfile(userId: string): Promise<AuthorizationProfile | null>;
  createFirstAdministrator(input: {
    readonly id: string;
    readonly email: string;
    readonly passwordHash: string;
    readonly fullName: string;
    readonly createdAt: Date;
  }): Promise<void>;
  recoverAdministrator(email: string, passwordHash: string, changedAt: Date): Promise<void>;
}
