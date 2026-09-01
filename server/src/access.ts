import type { MiddlewareHandler } from "hono";
import { entitlementFor } from "./entitlement.js";
import { error } from "./http.js";
import type { AppDeps, AppEnv } from "./types.js";

export function entitlementAccess(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const session = c.get("session");
    const entitlement = entitlementFor(session.user, session.subscription, deps.clock.now());
    c.set("entitlement", entitlement);
    if (c.req.method !== "GET" && entitlement.state === "expired") {
      return error(c, 402, "payment_required", "An active Maru Sync plan is required.");
    }
    await next();
  };
}
