export abstract class ApplicationError extends Error {
  abstract readonly code: string;
  abstract readonly safeMessage: string;
}

export class HttpApplicationError extends ApplicationError {
  readonly code: string;
  readonly safeMessage: string;
  readonly statusCode: number;

  constructor(code: string, safeMessage: string, statusCode: number) {
    super(safeMessage);
    this.name = "HttpApplicationError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.statusCode = statusCode;
  }
}

export class DatabaseUnavailableError extends ApplicationError {
  readonly code = "DATABASE_UNAVAILABLE";
  readonly safeMessage = "The service is temporarily unavailable.";

  constructor() {
    super("The database health check failed.");
    this.name = "DatabaseUnavailableError";
  }
}
