import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";
import { CheckDatabaseReadiness } from "../shared/application/use-cases/check-database-readiness";
import type { DatabaseHealthChecker } from "../shared/application/ports/database-health-checker";
import { registerErrorHandlers } from "../shared/presentation/http/error-handler";
import { pingRoutes, registerHealthRoutes } from "../shared/presentation/http/health-routes";

export interface AppDependencies {
  databaseHealthChecker: DatabaseHealthChecker;
  logger?: FastifyServerOptions["logger"];
}

export async function buildApp(dependencies: AppDependencies) {
  const app = Fastify({
    logger: dependencies.logger ?? {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie", "req.headers.set-cookie"],
      serializers: {
        req: (request) => ({ id: request.id, method: request.method }),
        res: (reply) => ({ statusCode: reply.statusCode }),
      },
    },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: "x-request-id",
    trustProxy: false,
  }).withTypeProvider<TypeBoxTypeProvider>();

  app.addHook("onResponse", async (request, reply) => {
    const statusCode = reply.statusCode;
    const statusLabel = statusCode >= 500 ? "FAIL" : statusCode >= 400 ? "WARN" : "OK";
    const method = request.method;
    const route = request.routeOptions.url ?? request.url.split("?")[0] ?? "/";
    const ip = request.ip;
    const durationMs = Number(reply.elapsedTime.toFixed(2));
    const fields = {
      event: "http.request",
      method,
      route,
      ip,
      statusCode,
      durationMs,
    };
    const message = `${statusLabel} ${statusCode} ${method} ${route} ${ip} ${durationMs} ms`;

    if (statusCode >= 500) {
      request.log.error(fields, message);
    } else if (statusCode >= 400) {
      request.log.warn(fields, message);
    } else {
      request.log.info(fields, message);
    }
  });

  registerErrorHandlers(app);

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Estrellas del Saber API",
        description: "Technical health endpoints for the initial backend foundation.",
        version: "0.1.0",
      },
      tags: [{ name: "health", description: "Process and dependency health" }],
    },
  });
  registerHealthRoutes(app, new CheckDatabaseReadiness(dependencies.databaseHealthChecker));
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(pingRoutes);

  await app.ready();
  return app;
}
