import { Hono } from "hono";
import { registerAccountRoutes } from "./account.js";
import { entitlementAccess } from "./access.js";
import { registerAuthRoutes } from "./auth.js";
import { registerBillingRoutes } from "./billing.js";
import { registerDeviceRoutes } from "./devices.js";
import { error } from "./http.js";
import { registerPushRoutes } from "./push.js";
import { bearerSession } from "./session.js";
import type { AppDeps, AppEnv } from "./types.js";
import { registerVaultRoutes } from "./vault.js";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    await next();
    deps.logger.info({
      code: "http_request",
      method: c.req.method,
      path: c.req.routePath || "unmatched",
      status: c.res.status,
      durationMs: Math.round(performance.now() - startedAt),
    }, "Request complete");
  });

  const session = bearerSession(deps);
  for (const path of [
    "/v1/auth/password",
    "/v1/auth/logout",
    "/v1/vault",
    "/v1/vault/*",
    "/v1/devices",
    "/v1/devices/*",
    "/v1/account",
    "/v1/push/register",
    "/v1/push/watch",
    "/v1/me",
    "/v1/billing/checkout",
    "/v1/billing/portal",
  ]) app.use(path, session);

  const entitlement = entitlementAccess(deps);
  for (const [method, path] of [
    ["PUT", "/v1/vault"],
    ["POST", "/v1/vault/restore"],
    ["POST", "/v1/push/register"],
    ["POST", "/v1/push/watch"],
    ["GET", "/v1/me"],
  ] as const) app.on(method, path, entitlement);

  registerAuthRoutes(app, deps);
  registerVaultRoutes(app, deps);
  registerDeviceRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerPushRoutes(app, deps);
  registerBillingRoutes(app, deps);

  app.get("/healthz", (c) => c.json({ ok: true, version: deps.version }));
  app.notFound((c) => error(c, 404, "not_found", "The endpoint does not exist."));
  app.onError((cause, c) => {
    deps.logger.error({ code: "internal_error", method: c.req.method, path: c.req.routePath || "unmatched" }, "Request failed");
    return error(c, 500, "internal_error", "The server could not complete the request.");
  });
  return app;
}
