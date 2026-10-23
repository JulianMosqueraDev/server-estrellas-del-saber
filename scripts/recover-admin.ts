import { stdin, stdout } from "node:process";
import { createIdentityApplication } from "../src/modules/identity/application/identity-application";
import { BunIdentitySecurity } from "../src/modules/identity/infrastructure/crypto/bun-identity-security";
import { PostgresIdentityRepository } from "../src/modules/identity/infrastructure/persistence/postgresql/postgres-identity-repository";
import { loadConfig } from "../src/shared/config/env";
import { createPostgresDatabase } from "../src/shared/infrastructure/persistence/postgresql/database";
import { promptHiddenPassword, promptText } from "./secure-prompts";

async function main(): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("Run this command from an interactive terminal.");
  }

  const email = await promptText("Existing super administrator email: ");
  let password = await promptHiddenPassword("New administrator password (hidden, 12-128 bytes): ");
  const confirmation = await promptHiddenPassword("Confirm new password: ");
  if (password !== confirmation) {
    password = "";
    throw new Error("Password confirmation did not match.");
  }

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
    await application.recoverAdministrator({ email, password });
    password = "";
    process.stdout.write("Administrator password updated; all refresh sessions were revoked.\n");
  } finally {
    await database.close();
  }
}

void main().catch(() => {
  process.stderr.write(
    "Administrator recovery did not complete. Verify the email belongs to an existing super administrator and check database connectivity.\n",
  );
  process.exitCode = 1;
});
