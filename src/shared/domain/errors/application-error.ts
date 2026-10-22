export abstract class ApplicationError extends Error {
  abstract readonly code: string;
  abstract readonly safeMessage: string;
}

export class DatabaseUnavailableError extends ApplicationError {
  readonly code = "DATABASE_UNAVAILABLE";
  readonly safeMessage = "The service is temporarily unavailable.";

  constructor() {
    super("The database health check failed.");
    this.name = "DatabaseUnavailableError";
  }
}
