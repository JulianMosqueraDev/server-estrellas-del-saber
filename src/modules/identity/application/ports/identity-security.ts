import type { PublicIdentity } from "./identity-repository";

export type AccessTokenClaims = {
  readonly userId: string;
  readonly sessionId: string;
};

export interface IdentitySecurity {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, passwordHash: string): Promise<boolean>;
  createRefreshToken(): string;
  hashRefreshToken(token: string): string;
  createId(): string;
  issueAccessToken(input: {
    readonly userId: string;
    readonly sessionId: string;
    readonly issuedAtSeconds: number;
  }): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
}

export type AuthenticatedIdentity = {
  readonly user: PublicIdentity;
  readonly sessionId: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
};
