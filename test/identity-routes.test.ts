import { afterEach, describe, expect, test } from "bun:test";
import type { DatabaseHealthChecker } from "../src/shared/application/ports/database-health-checker";
import { buildApp } from "../src/bootstrap/app";
import { REFRESH_COOKIE_NAME } from "../src/modules/identity/presentation/http/identity-routes";
import { createIdentityHarness } from "./support/identity-fixtures";

const openApps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

async function makeApp(options?: Parameters<typeof createIdentityHarness>[0]) {
  const harness = createIdentityHarness(options);
  const databaseHealthChecker: DatabaseHealthChecker = { check: async () => {} };
  const app = await buildApp({
    databaseHealthChecker,
    identity: { application: harness.application, config: harness.httpConfig },
    logger: false,
  });
  openApps.push(app);
  return { app, harness };
}

const validLogin = {
  method: "POST" as const,
  url: "/api/v1/auth/login",
  headers: { origin: "http://localhost:3000" },
  payload: { email: "admin@example.com", password: "Correct-Horse-123" },
};

describe("identity HTTP routes", () => {
  test("login sets an HttpOnly SameSite cookie and does not return the refresh token", async () => {
    const { app } = await makeApp();
    const response = await app.inject(validLogin);
    const cookie = response.headers["set-cookie"] as string;

    expect(response.statusCode).toBe(200);
    expect(response.json().tokenType).toBe("Bearer");
    expect(response.json().expiresIn).toBe(600);
    expect(response.body).not.toContain("refreshToken");
    expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    expect(cookie).toContain("Path=/api/v1/auth");
    expect(cookie.toLowerCase()).not.toContain("; secure");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  test("production cookie adds Secure and Origin mismatch is rejected", async () => {
    const { app } = await makeApp({ secureCookie: true });
    const response = await app.inject(validLogin);
    const rejected = await app.inject({
      ...validLogin,
      headers: { origin: "https://attacker.example" },
    });

    expect((response.headers["set-cookie"] as string).toLowerCase()).toContain("; secure");
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json().error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  test("rejects request bodies above the API size limit with a safe error", async () => {
    const { app } = await makeApp();
    const response = await app.inject({
      ...validLogin,
      payload: { email: "admin@example.com", password: "x".repeat(70_000) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large." },
    });
  });

  test("refresh rotates the cookie and logout clears it", async () => {
    const { app } = await makeApp();
    const loggedIn = await app.inject(validLogin);
    const initialCookie = loggedIn.headers["set-cookie"] as string;
    const rawCookie = initialCookie.split(";")[0];
    const refreshed = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { origin: "http://localhost:3000", cookie: rawCookie },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.headers["set-cookie"]).toBeDefined();
    expect(refreshed.body).not.toContain("refreshToken");

    const loggedOut = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        origin: "http://localhost:3000",
        cookie: refreshed.headers["set-cookie"] as string,
      },
    });
    expect(loggedOut.statusCode).toBe(200);
    expect((loggedOut.headers["set-cookie"] as string).toLowerCase()).toContain("max-age=0");
    expect(loggedOut.json()).toEqual({ status: "logged_out" });
  });

  test("me requires a valid bearer token and access-check distinguishes 403 from 401", async () => {
    const { app, harness } = await makeApp({ permissions: ["users.read"], roles: ["operator"] });
    const loggedIn = await app.inject(validLogin);
    const token = loggedIn.json().accessToken as string;

    const missingToken = await app.inject({ method: "GET", url: "/api/v1/auth/me" });
    const currentUser = await app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/admin/access-check",
      headers: { authorization: `Bearer ${token}` },
    });
    const allowedHarness = createIdentityHarness();
    const allowedApp = await buildApp({
      databaseHealthChecker: { check: async () => {} },
      identity: { application: allowedHarness.application, config: allowedHarness.httpConfig },
      logger: false,
    });
    openApps.push(allowedApp);
    const allowedLogin = await allowedApp.inject(validLogin);
    const allowed = await allowedApp.inject({
      method: "GET",
      url: "/api/v1/admin/access-check",
      headers: { authorization: `Bearer ${allowedLogin.json().accessToken}` },
    });
    const adminProfile = harness.repository.profiles.get("45fd8383-f28a-4cc8-9fb8-5cf68d3acd31")!;
    harness.repository.profiles.set(adminProfile.id, {
      ...adminProfile,
      permissions: ["users.read", "admin.access"],
    });
    const newlyGranted = await app.inject({
      method: "GET",
      url: "/api/v1/admin/access-check",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(missingToken.statusCode).toBe(401);
    expect(currentUser.statusCode).toBe(200);
    expect(currentUser.json().user.permissions).toEqual(["users.read"]);
    expect(forbidden.statusCode).toBe(403);
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toEqual({ access: "granted" });
    expect(newlyGranted.statusCode).toBe(200);
    expect(harness.repository.sessions.size).toBe(1);
  });

  test("OpenAPI documents implemented auth endpoints and security schemes", async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = response.json();

    expect(response.statusCode).toBe(200);
    expect(document.paths["/api/v1/auth/login"]).toBeDefined();
    expect(document.paths["/api/v1/auth/refresh"]).toBeDefined();
    expect(document.paths["/api/v1/auth/logout"]).toBeDefined();
    expect(document.paths["/api/v1/auth/me"].get.security).toEqual([{ bearerAuth: [] }]);
    expect(document.components.securitySchemes.refreshCookie.in).toBe("cookie");
  });

  test("rate limits login by IP and normalized account identifier", async () => {
    const { app, harness } = await makeApp({ loginRateLimitMax: 2 });
    const failedLogin = {
      ...validLogin,
      payload: { email: "admin@example.com", password: "incorrect" },
    };
    const first = await app.inject({ ...failedLogin, remoteAddress: "192.0.2.1" });
    const second = await app.inject({ ...failedLogin, remoteAddress: "192.0.2.2" });
    const limited = await app.inject({
      ...failedLogin,
      remoteAddress: "192.0.2.3",
      payload: { email: " ADMIN@EXAMPLE.COM ", password: "incorrect" },
    });
    const anotherAccountFromSameIp = await app.inject({
      ...failedLogin,
      remoteAddress: "192.0.2.3",
      payload: { email: "someone-else@example.com", password: "incorrect" },
    });
    const ipLimited = await app.inject({
      ...failedLogin,
      remoteAddress: "192.0.2.3",
      payload: { email: "third-account@example.com", password: "incorrect" },
    });

    expect(first.statusCode).toBe(401);
    expect(second.statusCode).toBe(401);
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();
    expect(anotherAccountFromSameIp.statusCode).toBe(401);
    expect(ipLimited.statusCode).toBe(429);
    expect(harness.repository.loginFailures).toHaveLength(3);
  });
});
