import { randomUUID } from "node:crypto";
import { sql, type Kysely, type Transaction } from "kysely";
import type {
  AuditContext,
  IdentityRepository,
  NewIdentitySession,
  PasswordCredential,
  RefreshRotationInput,
} from "../../../application/ports/identity-repository";
import type { Database } from "../../../../../shared/infrastructure/persistence/postgresql/database";

type DatabaseExecutor = Kysely<Database> | Transaction<Database>;

function boundedContext(context: AuditContext): AuditContext {
  return {
    ipAddress: context.ipAddress,
    userAgent: context.userAgent?.slice(0, 512) ?? null,
  };
}

async function writeAudit(
  executor: DatabaseExecutor,
  userId: string | null,
  eventType: string,
  occurredAt: Date,
  context: AuditContext,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  const bounded = boundedContext(context);
  await executor
    .insertInto("security_audit_logs")
    .values({
      id: randomUUID(),
      user_id: userId,
      event_type: eventType,
      occurred_at: occurredAt,
      ip_address: bounded.ipAddress,
      user_agent: bounded.userAgent,
      metadata,
    })
    .execute();
}

function toPublicIdentity(user: { id: string; email: string; full_name: string }) {
  return { id: user.id, email: user.email, fullName: user.full_name };
}

export class PostgresIdentityRepository implements IdentityRepository {
  constructor(private readonly db: Kysely<Database>) {}

  async findCredentialsByEmail(email: string): Promise<PasswordCredential | null> {
    const user = await this.db
      .selectFrom("users")
      .select(["id", "email", "password_hash", "full_name", "status"])
      .where("email", "=", email)
      .executeTakeFirst();

    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.password_hash,
      fullName: user.full_name,
      status: user.status,
    };
  }

  async recordLoginFailure(
    userId: string | null,
    audit: AuditContext,
    occurredAt: Date,
  ): Promise<void> {
    await writeAudit(this.db, userId, "login.failed", occurredAt, audit);
  }

  async createSession(session: NewIdentitySession): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto("auth_sessions")
        .values({
          id: session.id,
          user_id: session.userId,
          refresh_token_hash: session.refreshTokenHash,
          created_at: session.createdAt,
          expires_at: session.expiresAt,
          last_used_at: session.createdAt,
          revoked_at: null,
          ip_address: boundedContext(session.audit).ipAddress,
          user_agent: boundedContext(session.audit).userAgent,
        })
        .execute();
      await trx
        .updateTable("users")
        .set({ last_login_at: session.createdAt, updated_at: session.createdAt })
        .where("id", "=", session.userId)
        .execute();
      await writeAudit(trx, session.userId, "login.succeeded", session.createdAt, session.audit);
    });
  }

  async rotateRefreshToken(input: RefreshRotationInput) {
    return this.db.transaction().execute(async (trx) => {
      const session = await trx
        .selectFrom("auth_sessions")
        .selectAll()
        .where("refresh_token_hash", "=", input.previousTokenHash)
        .forUpdate()
        .executeTakeFirst();

      if (!session) {
        const rotatedToken = await trx
          .selectFrom("auth_refresh_token_history")
          .select(["session_id"])
          .where("token_hash", "=", input.previousTokenHash)
          .executeTakeFirst();

        if (rotatedToken) {
          const family = await trx
            .selectFrom("auth_sessions")
            .select(["id", "user_id", "revoked_at"])
            .where("id", "=", rotatedToken.session_id)
            .forUpdate()
            .executeTakeFirst();
          if (family && !family.revoked_at) {
            await trx
              .updateTable("auth_sessions")
              .set({ revoked_at: input.now })
              .where("id", "=", family.id)
              .execute();
          }
          await writeAudit(
            trx,
            family?.user_id ?? null,
            "refresh.reuse_detected",
            input.now,
            input.audit,
          );
          return { status: "reused" as const };
        }

        await writeAudit(trx, null, "refresh.failed", input.now, input.audit);
        return { status: "invalid" as const };
      }

      if (session.revoked_at || session.expires_at.getTime() <= input.now.getTime()) {
        await writeAudit(trx, session.user_id, "refresh.failed", input.now, input.audit);
        return { status: "invalid" as const };
      }

      const user = await trx
        .selectFrom("users")
        .select(["id", "email", "full_name", "status"])
        .where("id", "=", session.user_id)
        .executeTakeFirst();

      if (!user || user.status !== "active") {
        await trx
          .updateTable("auth_sessions")
          .set({ revoked_at: input.now })
          .where("id", "=", session.id)
          .execute();
        await writeAudit(trx, session.user_id, "refresh.denied_disabled", input.now, input.audit);
        return { status: "disabled" as const };
      }

      await trx
        .insertInto("auth_refresh_token_history")
        .values({
          id: randomUUID(),
          session_id: session.id,
          token_hash: input.previousTokenHash,
          replacement_hash: input.replacementTokenHash,
          used_at: input.now,
        })
        .execute();
      await trx
        .updateTable("auth_sessions")
        .set({
          refresh_token_hash: input.replacementTokenHash,
          last_used_at: input.now,
          expires_at: input.expiresAt,
          ip_address: boundedContext(input.audit).ipAddress,
          user_agent: boundedContext(input.audit).userAgent,
        })
        .where("id", "=", session.id)
        .execute();
      await writeAudit(trx, user.id, "refresh.succeeded", input.now, input.audit);

      return {
        status: "rotated" as const,
        sessionId: session.id,
        user: toPublicIdentity(user),
      };
    });
  }

  async revokeSessionByRefreshToken(
    tokenHash: string,
    audit: AuditContext,
    occurredAt: Date,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom("auth_sessions")
        .select(["id", "user_id", "revoked_at"])
        .where("refresh_token_hash", "=", tokenHash)
        .forUpdate()
        .executeTakeFirst();

      const historical = current
        ? undefined
        : await trx
            .selectFrom("auth_refresh_token_history")
            .select(["session_id"])
            .where("token_hash", "=", tokenHash)
            .executeTakeFirst();
      const session =
        current ??
        (historical
          ? await trx
              .selectFrom("auth_sessions")
              .select(["id", "user_id", "revoked_at"])
              .where("id", "=", historical.session_id)
              .forUpdate()
              .executeTakeFirst()
          : undefined);

      if (!session || session.revoked_at) return;

      await trx
        .updateTable("auth_sessions")
        .set({ revoked_at: occurredAt })
        .where("id", "=", session.id)
        .execute();
      await writeAudit(trx, session.user_id, "logout.succeeded", occurredAt, audit);
    });
  }

  async findAuthorizationProfile(userId: string) {
    const user = await this.db
      .selectFrom("users")
      .select(["id", "email", "full_name"])
      .where("id", "=", userId)
      .where("status", "=", "active")
      .executeTakeFirst();
    if (!user) return null;

    const roles = await this.db
      .selectFrom("user_roles")
      .innerJoin("roles", "roles.id", "user_roles.role_id")
      .select("roles.code")
      .where("user_roles.user_id", "=", userId)
      .orderBy("roles.code")
      .execute();
    const permissions = await this.db
      .selectFrom("user_roles")
      .innerJoin("role_permissions", "role_permissions.role_id", "user_roles.role_id")
      .innerJoin("permissions", "permissions.id", "role_permissions.permission_id")
      .select("permissions.code")
      .where("user_roles.user_id", "=", userId)
      .distinct()
      .orderBy("permissions.code")
      .execute();

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      roles: roles.map((role) => role.code),
      permissions: permissions.map((permission) => permission.code),
    };
  }

  async createFirstAdministrator(input: {
    readonly id: string;
    readonly email: string;
    readonly passwordHash: string;
    readonly fullName: string;
    readonly createdAt: Date;
  }): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext('estrellas:first-administrator')::bigint)`.execute(
        trx,
      );
      const existingAdministrator = await trx
        .selectFrom("user_roles")
        .innerJoin("roles", "roles.id", "user_roles.role_id")
        .select("user_roles.user_id")
        .where("roles.code", "=", "super_admin")
        .executeTakeFirst();
      if (existingAdministrator) {
        throw new Error("The initial administrator has already been configured.");
      }

      const role = await trx
        .selectFrom("roles")
        .select("id")
        .where("code", "=", "super_admin")
        .executeTakeFirst();
      if (!role) throw new Error("Identity RBAC seed migration has not been applied.");

      await trx
        .insertInto("users")
        .values({
          id: input.id,
          email: input.email,
          password_hash: input.passwordHash,
          full_name: input.fullName,
          status: "active",
          created_at: input.createdAt,
          updated_at: input.createdAt,
          last_login_at: null,
          password_changed_at: input.createdAt,
        })
        .execute();
      await trx.insertInto("user_roles").values({ user_id: input.id, role_id: role.id }).execute();
      await writeAudit(trx, input.id, "bootstrap.administrator_created", input.createdAt, {
        ipAddress: null,
        userAgent: null,
      });
    });
  }

  async recoverAdministrator(email: string, passwordHash: string, changedAt: Date): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`select pg_advisory_xact_lock(hashtext('estrellas:first-administrator')::bigint)`.execute(
        trx,
      );
      const administrator = await trx
        .selectFrom("users")
        .innerJoin("user_roles", "user_roles.user_id", "users.id")
        .innerJoin("roles", "roles.id", "user_roles.role_id")
        .select(["users.id", "users.status"])
        .where("users.email", "=", email)
        .where("roles.code", "=", "super_admin")
        .forUpdate()
        .executeTakeFirst();
      if (!administrator) {
        throw new Error("No existing super administrator matches the requested email.");
      }

      await trx
        .updateTable("users")
        .set({
          password_hash: passwordHash,
          password_changed_at: changedAt,
          updated_at: changedAt,
        })
        .where("id", "=", administrator.id)
        .execute();
      await trx
        .updateTable("auth_sessions")
        .set({ revoked_at: changedAt })
        .where("user_id", "=", administrator.id)
        .where("revoked_at", "is", null)
        .execute();
      await writeAudit(trx, administrator.id, "bootstrap.administrator_recovered", changedAt, {
        ipAddress: null,
        userAgent: null,
      });
    });
  }
}
