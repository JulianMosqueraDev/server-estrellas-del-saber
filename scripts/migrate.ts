import { loadConfig } from "../src/shared/config/env";
import { runPendingMigrations } from "../src/shared/infrastructure/persistence/postgresql/database";

async function main(): Promise<void> {
  try {
    const migrations = await runPendingMigrations(loadConfig());
    process.stdout.write(
      migrations.length === 0
        ? "No pending migrations.\n"
        : `Applied migrations: ${migrations.join(", ")}\n`,
    );
  } catch {
    process.stderr.write("Database migrations failed. Check connectivity and migration code.\n");
    process.exitCode = 1;
  }
}

void main();
