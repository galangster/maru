import { Hono } from "hono";
import { registerAccountRoutes } from "./account.js";
import { registerAuthRoutes } from "./auth.js";
import { registerBillingRoutes } from "./billing.js";
import { registerDeviceRoutes } from "./devices.js";
import { error } from "./http.js";
import { registerPushRoutes } from "./push.js";
import { bearerSession, type AppEnv } from "./session.js";
import type { AppDeps } from "./types.js";
import { registerVaultRoutes } from "./vault.js";

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    await next();
    deps.logger.info({
      code: "http_request",
      method: c.req.method,
      path: c.req.routePath || c.req.path,
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

  registerAuthRoutes(app, deps);
  registerVaultRoutes(app, deps);
  registerDeviceRoutes(app, deps);
  registerAccountRoutes(app, deps);
  registerPushRoutes(app, deps);
  registerBillingRoutes(app, deps);

  app.get("/healthz", (c) => c.json({ ok: true, version: deps.version }));
  app.notFound((c) => error(c, 404, "not_found", "The endpoint does not exist."));
  app.onError((cause, c) => {
    deps.logger.error({ code: "internal_error", method: c.req.method, path: c.req.routePath || c.req.path }, "Request failed");
    return c.json({ error: "internal_error", message: "The server could not complete the request." }, 500);
  });
  return app;
}
