import type { Context } from "hono";
import { entitlementFor } from "./entitlement.js";
import { error } from "./http.js";
import type { AppDeps, AppVariables, SubscriptionRow } from "./types.js";

export async function currentEntitlement(c: Context<{ Variables: AppVariables }>, deps: AppDeps) {
  const user = c.get("session").user;
  const [subscription] = await deps.db.query<SubscriptionRow>(
    "SELECT * FROM subscriptions WHERE user_id = $1",
    [user.id],
  );
  return entitlementFor(user, subscription ?? null, deps.clock.now());
}

export async function requirePaidWrite(c: Context<{ Variables: AppVariables }>, deps: AppDeps) {
  const entitlement = await currentEntitlement(c, deps);
  return entitlement.state === "expired"
    ? error(c, 402, "payment_required", "An active Maru Sync plan is required.")
    : null;
}
