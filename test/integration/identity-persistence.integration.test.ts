import { afterAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  createPostgresDatabase,
  runPendingMigrations,
} from "../../src/shared/infrastructure/persistence/postgresql/database";
import { PostgresIdentityRepository } from "../../src/modules/identity/infrastructure/persistence/postgresql/postgres-identity-repository";
import { up as seedIdentityRbac } from "../../migrations/0002_seed_identity_rbac";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const createdSchemas: { pool: Pool; schema: string }[] = [];

afterAll(async () => {
  await Promise.all(
    createdSchemas.map(async ({ pool, schema }) => {
      try {
        await pool.query(`drop schema if exists "${schema}" cascade`);
      } finally {
        await pool.end();
      }
    }),
  );
});

describe.skipIf(!testDatabaseUrl)("PostgreSQL identity persistence", () => {
  test("migrates reproducibly, enforces constraints, and serializes refresh rotation", async () => {
    const schema = `identity_test_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: testDatabaseUrl });
    createdSchemas.push({ pool: adminPool, schema });
    await adminPool.query(`create schema "${schema}"`);

    const isolatedUrl = new URL(testDatabaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    const config = {
      databaseUrl: isolatedUrl.toString(),
      databasePoolMax: 5,
      databaseConnectionTimeoutMs: 2_000,
    };
    const migrated = await runPendingMigrations(config);
    expect(migrated).toEqual(["0001_identity_schema", "0002_seed_identity_rbac"]);
    expect(await runPendingMigrations(config)).toEqual([]);

    const database = createPostgresDatabase(config);
    try {
      const repository = new PostgresIdentityRepository(database.connection);
      const now = new Date("2026-10-23T12:00:00.000Z");
      const userId = randomUUID();
      await repository.createFirstAdministrator({
        id: userId,
        email: "Admin@Example.com".toLowerCase(),
        passwordHash: "$argon2id$test-hash",
        fullName: "Initial Administrator",
        createdAt: now,
      });

      const profile = await repository.findAuthorizationProfile(userId);
      expect(profile?.roles).toEqual(["super_admin"]);
      expect(profile?.permissions).toContain("admin.access");
      await seedIdentityRbac(database.connection);
      expect(
        await database.connection
          .selectFrom("role_permissions")
          .select("permission_id")
          .where("role_id", "=", "00000000-0000-4000-8000-000000000001")
          .execute(),
      ).toHaveLength(7);

      await expect(
        database.connection
          .insertInto("users")
          .values({
            id: randomUUID(),
            email: "admin@example.com",
            password_hash: "$argon2id$test-hash",
            full_name: "Duplicate Email",
            status: "active",
            created_at: now,
            updated_at: now,
            last_login_at: null,
            password_changed_at: now,
          })
          .execute(),
      ).rejects.toThrow();

      const rawRefreshToken = "opaque-refresh-token-that-never-enters-a-database-column";
      const initialHash = createHash("sha256").update(rawRefreshToken).digest("hex");
      const sessionId = randomUUID();
      await repository.createSession({
        id: sessionId,
        userId,
        refreshTokenHash: initialHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
        audit: { ipAddress: "127.0.0.1", userAgent: "integration-test" },
      });

      const results = await Promise.all(
        ["a", "b"].map((replacement) =>
          repository.rotateRefreshToken({
            previousTokenHash: initialHash,
            replacementTokenHash: createHash("sha256")
              .update(`${replacement}-replacement`)
              .digest("hex"),
            now: new Date(now.getTime() + 1_000),
            expiresAt: new Date(now.getTime() + 61_000),
            audit: { ipAddress: "127.0.0.1", userAgent: "integration-test" },
          }),
        ),
      );

      expect(results.map((result) => result.status).sort()).toEqual(["reused", "rotated"]);
      expect(
        await database.connection
          .selectFrom("auth_sessions")
          .select(["refresh_token_hash", "revoked_at"])
          .where("id", "=", sessionId)
          .executeTakeFirst(),
      ).toMatchObject({ revoked_at: expect.any(Date) });
      expect(
        await database.connection.selectFrom("auth_refresh_token_history").selectAll().execute(),
      ).toHaveLength(1);

      const persistedSession = await database.connection
        .selectFrom("auth_sessions")
        .select("refresh_token_hash")
        .where("id", "=", sessionId)
        .executeTakeFirstOrThrow();
      expect(persistedSession.refresh_token_hash).not.toBe(rawRefreshToken);
      const auditRows = await database.connection
        .selectFrom("security_audit_logs")
        .select("event_type")
        .where("user_id", "=", userId)
        .execute();
      expect(auditRows.map((row) => row.event_type)).toContain("refresh.reuse_detected");
    } finally {
      await database.close();
    }
  });
});
