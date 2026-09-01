import { afterEach, describe, expect, it, vi } from "vitest";
import type { BillingClient, StripeEvent } from "../src/types.js";
import { allow, bearer, EMAIL, fixture, signup } from "./helpers.js";

const close: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(close.splice(0).map((fn) => fn())));

function billingMock(event: StripeEvent): BillingClient {
  return {
    createCustomer: vi.fn(async () => ({ id: "cus_test" })),
    createCheckout: vi.fn(async () => ({ url: "https://checkout.stripe.test/session" })),
    createPortal: vi.fn(async () => ({ url: "https://billing.stripe.test/portal" })),
    constructEvent: vi.fn(() => event),
  };
}

describe("billing", () => {
  it("creates a lazy customer and mocked monthly checkout", async () => {
    const billing = billingMock({ id: "evt_unused", type: "ignored", data: { object: {} } });
    const value = await fixture({
      billing,
      stripeWebhookSecret: "whsec_test",
      stripePriceMonthly: "price_monthly",
      stripePriceYearly: "price_yearly",
    });
    close.push(() => value.db.close());
    await allow(value.db);
    const created = await signup(value.app);
    const response = await value.app.request("/v1/billing/checkout", {
      method: "POST",
      headers: bearer(created.body.token),
      body: JSON.stringify({ plan: "monthly" }),
    });
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.test/session" });
    expect(billing.createCustomer).toHaveBeenCalledWith(EMAIL, created.body.accountId);
    expect(billing.createCheckout).toHaveBeenCalledWith({
      customerId: "cus_test",
      accountId: created.body.accountId,
      priceId: "price_monthly",
    });
  });

  it("processes a signed subscription event once", async () => {
    const event: StripeEvent = {
      id: "evt_subscription",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test",
          customer: "cus_test",
          status: "active",
          cancel_at_period_end: true,
          current_period_end: 1_780_272_000,
          items: { data: [{ price: { id: "price_yearly", recurring: { interval: "year" } } }] },
        },
      },
    };
    const billing = billingMock(event);
    const value = await fixture({
      billing,
      stripeWebhookSecret: "whsec_test",
      stripePriceMonthly: "price_monthly",
      stripePriceYearly: "price_yearly",
    });
    close.push(() => value.db.close());
    await allow(value.db);
    const created = await signup(value.app);
    await value.db.query("UPDATE users SET stripe_customer_id = 'cus_test' WHERE id = $1", [created.body.accountId]);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await value.app.request("/v1/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": "valid", "content-type": "application/json" },
        body: "{\"raw\":true}",
      });
      expect(response.status).toBe(200);
    }
    const [subscription] = await value.db.query<{ status: string; plan: string; cancel_at_period_end: boolean }>(
      "SELECT status, plan, cancel_at_period_end FROM subscriptions",
    );
    expect(subscription).toEqual({ status: "active", plan: "yearly", cancel_at_period_end: true });
    const [events] = await value.db.query<{ count: string }>("SELECT count(*)::text AS count FROM stripe_events");
    expect(events!.count).toBe("1");
  });

  it("returns 503 without Stripe configuration", async () => {
    const value = await fixture();
    close.push(() => value.db.close());
    await allow(value.db);
    const created = await signup(value.app);
    const response = await value.app.request("/v1/billing/portal", {
      method: "POST",
      headers: bearer(created.body.token),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: "billing_unavailable" });
  });

  it("locks writes but leaves reads open for an expired account", async () => {
    const value = await fixture();
    close.push(() => value.db.close());
    await allow(value.db);
    const created = await signup(value.app);
    await value.db.query(
      "UPDATE users SET comped = false, trial_ends_at = $2 WHERE id = $1",
      [created.body.accountId, new Date("2026-08-01T00:00:00Z")],
    );
    const write = await value.app.request("/v1/vault", {
      method: "PUT",
      headers: bearer(created.body.token),
      body: JSON.stringify({ baseVersion: 0, ciphertext: "cipher" }),
    });
    expect(write.status).toBe(402);
    expect(await write.json()).toMatchObject({ error: "payment_required" });
    expect((await value.app.request("/v1/vault", { headers: bearer(created.body.token) })).status).toBe(204);
    const me = await value.app.request("/v1/me", { headers: bearer(created.body.token) });
    expect(await me.json()).toMatchObject({ entitlement: { state: "expired" } });
  });
});
