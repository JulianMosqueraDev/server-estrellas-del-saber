import { resolve } from "node:path";
import { buildApp } from "./bootstrap/app";
import { loadConfig } from "./shared/config/env";
import { createPostgresDatabase } from "./shared/infrastructure/persistence/postgresql/database";

async function start(): Promise<void> {
  const config = loadConfig();
  const database = createPostgresDatabase(config);
  const app = await buildApp({
    databaseHealthChecker: database,
    logger: {
      level: config.logLevel,
      ...(config.environment === "development"
        ? {
            transport: {
              target: resolve(__dirname, "shared/infrastructure/logging/pino-pretty-transport.cjs"),
              options: {
                colorize: true,
                translateTime: "SYS:standard",
                ignore: "pid,hostname,reqId,event,method,route,ip,statusCode,durationMs",
                singleLine: true,
              },
            },
          }
        : {}),
      redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.set-cookie"],
      serializers: {
        req: (request) => ({ id: request.id, method: request.method }),
        res: (reply) => ({ statusCode: reply.statusCode }),
      },
    },
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, "Shutting down");

    try {
      await app.close();
      await database.close();
    } catch {
      app.log.error({ errorCode: "SHUTDOWN_FAILED" }, "A resource did not close cleanly");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch {
    app.log.fatal({ errorCode: "SERVER_START_FAILED" }, "The API could not start");
    await shutdown("SIGTERM");
    process.exitCode = 1;
  }
}

void start().catch((error: unknown) => {
  const reason =
    error instanceof Error
      ? `${error.name}: ${error.message}`.replace(/\s+/g, " ").slice(0, 240)
      : "Unknown startup error";
  process.stderr.write(`The API could not start (${reason}).\n`);
  process.exitCode = 1;
});
