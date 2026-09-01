import { BILLING_GRACE_DAYS } from "./constants.js";
import type { SubscriptionRow, UserRow } from "./types.js";
import { addDays, asDate } from "./util.js";

export type EntitlementState = "trialing" | "active" | "past_due" | "expired" | "comped";

export interface Entitlement {
  state: EntitlementState;
  plan: string | null;
  trialEndsAt: string;
  periodEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export function entitlementFor(
  user: Pick<UserRow, "comped" | "trial_ends_at">,
  subscription: SubscriptionRow | null,
  now: Date,
): Entitlement {
  const trialEndsAt = asDate(user.trial_ends_at) as Date;
  const base = {
    plan: subscription?.plan ?? null,
    trialEndsAt: trialEndsAt.toISOString(),
    periodEndsAt: asDate(subscription?.current_period_end)?.toISOString() ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
  };

  if (user.comped) return { state: "comped", ...base };
  if (subscription?.status === "active" || subscription?.status === "trialing") {
    return { state: "active", ...base };
  }
  if (subscription?.status === "past_due" && subscription.past_due_since) {
    const graceEndsAt = addDays(asDate(subscription.past_due_since) as Date, BILLING_GRACE_DAYS);
    if (now < graceEndsAt) return { state: "past_due", ...base };
  }
  if (subscription === null && now < trialEndsAt) return { state: "trialing", ...base };
  return { state: "expired", ...base };
}
