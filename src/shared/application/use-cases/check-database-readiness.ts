import { DatabaseUnavailableError } from "../../domain/errors/application-error";
import type { DatabaseHealthChecker } from "../ports/database-health-checker";

export class CheckDatabaseReadiness {
  constructor(private readonly database: DatabaseHealthChecker) {}

  async execute(): Promise<void> {
    try {
      await this.database.check();
    } catch {
      throw new DatabaseUnavailableError();
    }
  }
}
