import { Migrator, FileMigrationProvider, Kysely, PostgresDialect, sql } from "kysely";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { AppConfig } from "../../../config/env";
import type { DatabaseHealthChecker } from "../../../application/ports/database-health-checker";

type Database = Record<string, never>;

function createKysely(
  config: Pick<AppConfig, "databaseUrl" | "databasePoolMax" | "databaseConnectionTimeoutMs">,
): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: config.databaseUrl,
        max: config.databasePoolMax,
        connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
        application_name: "estrellas-del-saber-api",
      }),
    }),
  });
}

export interface PostgresDatabase extends DatabaseHealthChecker {
  close(): Promise<void>;
}

export function createPostgresDatabase(
  config: Pick<AppConfig, "databaseUrl" | "databasePoolMax" | "databaseConnectionTimeoutMs">,
): PostgresDatabase {
  const db = createKysely(config);

  return {
    async check() {
      await sql`select 1`.execute(db);
    },
    async close() {
      await db.destroy();
    },
  };
}

export async function runPendingMigrations(
  config: Pick<AppConfig, "databaseUrl" | "databasePoolMax" | "databaseConnectionTimeoutMs">,
): Promise<readonly string[]> {
  const db = createKysely(config);
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve("migrations"),
    }),
  });

  try {
    const { error, results } = await migrator.migrateToLatest();
    if (error || results?.some((result) => result.status === "Error")) {
      throw new Error("Migration failed. Check database connectivity and migration code.");
    }

    return (results ?? [])
      .filter((result) => result.status === "Success")
      .map((result) => result.migrationName);
  } finally {
    await db.destroy();
  }
}
