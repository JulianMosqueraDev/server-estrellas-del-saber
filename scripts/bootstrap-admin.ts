import { stdin, stdout } from "node:process";
import { promptHiddenPassword, promptText } from "./secure-prompts";
import { loadConfig } from "../src/shared/config/env";
import { createIdentityApplication } from "../src/modules/identity/application/identity-application";
import { BunIdentitySecurity } from "../src/modules/identity/infrastructure/crypto/bun-identity-security";
import { PostgresIdentityRepository } from "../src/modules/identity/infrastructure/persistence/postgresql/postgres-identity-repository";
import { createPostgresDatabase } from "../src/shared/infrastructure/persistence/postgresql/database";

async function main(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "Run this command from an interactive terminal; credentials are never read from arguments.",
    );
  }

  const email = await promptText("Administrator email: ");
  const fullName = await promptText("Administrator full name: ");
  let password = await promptHiddenPassword("Administrator password (hidden, 12-128 bytes): ");
  const config = loadConfig();
  const database = createPostgresDatabase(config);

  try {
    const security = new BunIdentitySecurity(
      config.authJwtSecret,
      config.authJwtIssuer,
      config.authJwtAudience,
      config.authAccessTokenTtlSeconds,
      config.authJwtPreviousSecret,
    );
    const application = createIdentityApplication({
      repository: new PostgresIdentityRepository(database.connection),
      security,
      accessTokenTtlSeconds: config.authAccessTokenTtlSeconds,
      refreshTokenTtlSeconds: config.authRefreshTokenTtlSeconds,
    });
    await application.createFirstAdministrator({ email, fullName, password });
    password = "";
    process.stdout.write(
      "Initial administrator created. Sign in through the configured web origin.\n",
    );
  } finally {
    await database.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    "Administrator bootstrap did not complete. Check database connectivity, migrations, input, and whether an administrator already exists.\n",
  );
  process.exitCode = 1;
});
