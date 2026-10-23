import type { FastifyInstance } from "fastify";
import {
  ApplicationError,
  DatabaseUnavailableError,
  HttpApplicationError,
} from "../../domain/errors/application-error";

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

    if (error instanceof HttpApplicationError) {
      if (error.statusCode >= 500) {
        request.log.error({ errorCode: error.code }, "Request failed safely");
      } else if (error.statusCode >= 400) {
        request.log.warn({ errorCode: error.code }, "Request rejected");
      }
      return reply.code(error.statusCode).send({
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

    const frameworkStatusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? error.statusCode
        : undefined;
    if (frameworkStatusCode === 413) {
      return reply.code(413).send({
        error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
      } satisfies ErrorResponse);
    }
    if (frameworkStatusCode === 415) {
      return reply.code(415).send({
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "The request content type is not supported.",
        },
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
