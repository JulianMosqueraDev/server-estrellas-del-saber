import { afterEach, describe, expect, test } from "bun:test";
import type { DatabaseHealthChecker } from "../src/shared/application/ports/database-health-checker";
import { buildApp } from "../src/bootstrap/app";

const openApps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function makeApp(check: () => Promise<void>) {
  const databaseHealthChecker: DatabaseHealthChecker = { check };
  const app = await buildApp({ databaseHealthChecker, logger: false });
  openApps.push(app);
  return app;
}

describe("health routes", () => {
  test("health is independent of PostgreSQL availability", async () => {
    const app = await makeApp(async () => {
      throw new Error("database should not be checked by /health");
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  test("ready returns a stable safe error when the database is unavailable", async () => {
    const app = await makeApp(async () => {
      throw new Error("private database detail");
    });

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
      },
    });
    expect(response.body).not.toContain("private database detail");
  });

  test("ready succeeds when the database is available", async () => {
    const app = await makeApp(async () => {});

    const response = await app.inject({ method: "GET", url: "/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  test("serves an OpenAPI document for implemented endpoints", async () => {
    const app = await makeApp(async () => {});

    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = response.json();

    expect(response.statusCode).toBe(200);
    expect(document.paths["/health"]).toBeDefined();
    expect(document.paths["/ready"]).toBeDefined();
    expect(document.paths["/students"]).toBeUndefined();
  });

  test("returns a stable 404 without framework internals", async () => {
    const app = await makeApp(async () => {});

    const response = await app.inject({ method: "GET", url: "/unknown" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "The requested route was not found." },
    });
  });
});
