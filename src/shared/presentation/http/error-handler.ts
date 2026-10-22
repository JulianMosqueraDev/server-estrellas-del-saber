import type { FastifyInstance } from "fastify";
import { ApplicationError, DatabaseUnavailableError } from "../../domain/errors/application-error";

type ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DatabaseUnavailableError) {
      return reply.code(503).send({
        error: { code: error.code, message: error.safeMessage },
      } satisfies ErrorResponse);
    }

    if (error instanceof ApplicationError) {
      request.log.warn({ errorCode: error.code }, "Request rejected by application");
      return reply.code(400).send({
        error: { code: error.code, message: error.safeMessage },
      } satisfies ErrorResponse);
    }

    const hasValidationErrors =
      typeof error === "object" &&
      error !== null &&
      "validation" in error &&
      Array.isArray(error.validation);

    if (hasValidationErrors) {
      return reply.code(400).send({
        error: { code: "VALIDATION_ERROR", message: "The request is invalid." },
      } satisfies ErrorResponse);
    }

    request.log.error({ errorCode: "INTERNAL_SERVER_ERROR" }, "Unexpected request error");
    return reply.code(500).send({
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred." },
    } satisfies ErrorResponse);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({
      error: { code: "NOT_FOUND", message: "The requested route was not found." },
    } satisfies ErrorResponse),
  );
}
