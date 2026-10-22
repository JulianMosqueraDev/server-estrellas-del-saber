import { Type, type Static } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import type { CheckDatabaseReadiness } from "../../application/use-cases/check-database-readiness";

const HealthResponse = Type.Object({ status: Type.Literal("ok") });
const ReadyResponse = Type.Object({ status: Type.Literal("ready") });
const ErrorResponse = Type.Object({
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});

type HealthResponseBody = Static<typeof HealthResponse>;
type ReadyResponseBody = Static<typeof ReadyResponse>;

export function registerHealthRoutes(
  app: FastifyInstance,
  readiness: CheckDatabaseReadiness,
): void {
  app.get<{ Reply: HealthResponseBody }>(
    "/health",
    {
      schema: {
        tags: ["health"],
        summary: "Check whether the API process is running",
        response: { 200: HealthResponse },
      },
    },
    async () => ({ status: "ok" }),
  );

  app.get<{ Reply: ReadyResponseBody }>(
    "/ready",
    {
      schema: {
        tags: ["health"],
        summary: "Check whether the API can reach its database",
        response: { 200: ReadyResponse, 503: ErrorResponse },
      },
    },
    async () => {
      await readiness.execute();
      return { status: "ready" };
    },
  );
}
