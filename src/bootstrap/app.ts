import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import Fastify, { LogController, type FastifyServerOptions } from "fastify";
import { CheckDatabaseReadiness } from "../shared/application/use-cases/check-database-readiness";
import type { DatabaseHealthChecker } from "../shared/application/ports/database-health-checker";
import { registerErrorHandlers } from "../shared/presentation/http/error-handler";
import { pingRoutes, registerHealthRoutes } from "../shared/presentation/http/health-routes";
import {
  registerIdentityRoutes,
  type IdentityHttpConfig,
} from "../modules/identity/presentation/http/identity-routes";
import type { IdentityApplication } from "../modules/identity/application/identity-application";

export interface AppDependencies {
  databaseHealthChecker: DatabaseHealthChecker;
  logger?: FastifyServerOptions["logger"];
  identity?: {
    readonly application: IdentityApplication;
    readonly config: IdentityHttpConfig;
  };
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
    bodyLimit: 64 * 1024,
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

  if (dependencies.identity) {
    await app.register(cookie);
    await app.register(cors, {
      origin: dependencies.identity.config.webOrigin,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
      maxAge: 600,
    });
    await app.register(rateLimit, { global: false, hook: "preHandler", ipv6Subnet: 64 });
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: "Estrellas del Saber API",
        description:
          "Authentication, authorization and technical health endpoints for Estrellas del Saber.",
        version: "0.1.0",
      },
      tags: [
        { name: "health", description: "Process and dependency health" },
        { name: "identity", description: "Authentication, sessions and permissions" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          refreshCookie: {
            type: "apiKey",
            in: "cookie",
            name: "eds_refresh",
            description: "Opaque HttpOnly refresh token set by the API.",
          },
        },
      },
    },
  });
  registerHealthRoutes(app, new CheckDatabaseReadiness(dependencies.databaseHealthChecker));
  await app.register(swaggerUi, { routePrefix: "/docs" });

  if (dependencies.identity) {
    await registerIdentityRoutes(app, dependencies.identity);
  }

  await app.register(pingRoutes);

  await app.ready();
  return app;
}
