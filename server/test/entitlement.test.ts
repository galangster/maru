import { describe, expect, it } from "vitest";
import { entitlementFor } from "../src/entitlement.js";
import type { SubscriptionRow } from "../src/types.js";

const now = new Date("2026-09-01T00:00:00.000Z");
const user = (overrides: { comped?: boolean; trial_ends_at?: Date } = {}) => ({
  comped: overrides.comped ?? false,
  trial_ends_at: overrides.trial_ends_at ?? new Date("2026-09-10T00:00:00.000Z"),
});
const subscription = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  user_id: "user",
  stripe_subscription_id: "sub_1",
  status: "active",
  plan: "monthly",
  current_period_end: new Date("2026-10-01T00:00:00.000Z"),
  cancel_at_period_end: false,
  past_due_since: null,
  ...overrides,
});

describe("entitlementFor", () => {
  it("returns comped before every paid state", () => {
    expect(entitlementFor(user({ comped: true }), subscription({ status: "past_due" }), now).state).toBe("comped");
  });

  it.each(["active", "trialing"] as const)("maps a Stripe %s subscription to active", (status) => {
    expect(entitlementFor(user(), subscription({ status }), now).state).toBe("active");
  });

  it("returns trialing while a no-card trial is open", () => {
    expect(entitlementFor(user(), null, now).state).toBe("trialing");
  });

  it("expires a trial at its exact end", () => {
    expect(entitlementFor(user({ trial_ends_at: now }), null, now).state).toBe("expired");
  });

  it("keeps past-due access before the grace deadline", () => {
    const result = entitlementFor(user(), subscription({
      status: "past_due",
      past_due_since: new Date("2026-08-25T00:00:00.001Z"),
    }), now);
    expect(result.state).toBe("past_due");
  });

  it("expires past-due access at the seven-day deadline", () => {
    const result = entitlementFor(user(), subscription({
      status: "past_due",
      past_due_since: new Date("2026-08-25T00:00:00.000Z"),
    }), now);
    expect(result.state).toBe("expired");
  });

  it("expires an ended subscription", () => {
    expect(entitlementFor(user(), subscription({ status: "ended" }), now).state).toBe("expired");
  });
});
