import Stripe from "stripe";
import type { Hono } from "hono";
import type { Db } from "./db.js";
import { error, jsonBody } from "./http.js";
import type { AppDeps, AppEnv, BillingClient, StripeEvent, SubscriptionRow, SubscriptionStatus } from "./types.js";
import { isRecord } from "./util.js";

const SUCCESS_URL = "https://getmaru.app/account?checkout=success";
const CANCEL_URL = "https://getmaru.app/account?checkout=cancel";
const PORTAL_URL = "https://getmaru.app/account";

export function createStripeClient(secretKey: string): BillingClient {
  const stripe = new Stripe(secretKey);
  return {
    createCustomer: (email, accountId) => stripe.customers.create({ email, metadata: { accountId } }),
    createCheckout: ({ customerId, accountId, priceId }) => stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: accountId,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      subscription_data: { metadata: { accountId } },
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    }),
    createPortal: (customerId) => stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: PORTAL_URL,
    }),
    constructEvent: (rawBody, signature, secret) =>
      stripe.webhooks.constructEvent(rawBody, signature, secret) as unknown as StripeEvent,
  };
}

function stringField(value: unknown) {
  return typeof value === "string" ? value : null;
}

function timestampField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? new Date(value * 1000) : null;
}

function objectField(value: unknown) {
  return isRecord(value) ? value : null;
}

function subscriptionDetails(object: Record<string, unknown>) {
  return objectField(objectField(object.parent)?.subscription_details);
}

function subscriptionIdFromInvoice(object: Record<string, unknown>) {
  const direct = stringField(object.subscription);
  if (direct) return direct;
  return stringField(subscriptionDetails(object)?.subscription);
}

function subscriptionPrice(object: Record<string, unknown>) {
  const items = objectField(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = objectField(data[0]);
  return objectField(first?.price);
}

function subscriptionPeriodEnd(object: Record<string, unknown>) {
  const direct = timestampField(object.current_period_end);
  if (direct) return direct;
  const items = objectField(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  return timestampField(objectField(data[0])?.current_period_end);
}

function accountIdFromMetadata(object: Record<string, unknown>) {
  const direct = stringField(objectField(object.metadata)?.accountId);
  if (direct) return direct;
  return stringField(objectField(subscriptionDetails(object)?.metadata)?.accountId);
}

function subscriptionStatus(value: unknown): SubscriptionStatus {
  return value === "active" || value === "trialing" || value === "past_due" ? value : "ended";
}

async function findUserId(db: Db, accountId: string | null, customerId: string | null) {
  if (!accountId && !customerId) return null;
  const [user] = await db.query<{ id: string }>(
    `UPDATE users SET stripe_customer_id = COALESCE(stripe_customer_id, $2)
      WHERE ($1::text IS NOT NULL AND id = $1)
         OR ($1::text IS NULL AND stripe_customer_id = $2)
      RETURNING id`,
    [accountId, customerId],
  );
  return user?.id ?? null;
}

function planFor(object: Record<string, unknown>, deps: AppDeps) {
  const price = subscriptionPrice(object);
  const id = stringField(price?.id);
  if (id === deps.stripePriceMonthly) return "monthly";
  if (id === deps.stripePriceYearly) return "yearly";
  const recurring = objectField(price?.recurring);
  return recurring?.interval === "year" ? "yearly" : recurring?.interval === "month" ? "monthly" : null;
}

async function handleStripeEvent(event: StripeEvent, deps: AppDeps) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    const accountId = stringField(object.client_reference_id);
    const customerId = stringField(object.customer);
    if (accountId && customerId) {
      await deps.db.query("UPDATE users SET stripe_customer_id = $2 WHERE id = $1", [accountId, customerId]);
    }
    return;
  }

  if (event.type.startsWith("customer.subscription.")) {
    const subscriptionId = stringField(object.id);
    const customerId = stringField(object.customer);
    const stripeStatus = stringField(object.status);
    if (!subscriptionId || !customerId || !stripeStatus) return;
    const status = subscriptionStatus(stripeStatus);
    const accountId = accountIdFromMetadata(object);
    const userId = await findUserId(deps.db, accountId, customerId);
    if (!userId) return;
    await deps.db.query(
      `INSERT INTO subscriptions
        (user_id, stripe_subscription_id, status, plan, current_period_end, cancel_at_period_end, past_due_since)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $3 = 'past_due' THEN $7::timestamptz ELSE NULL END)
       ON CONFLICT (user_id) DO UPDATE SET
         stripe_subscription_id = EXCLUDED.stripe_subscription_id,
         status = EXCLUDED.status,
         plan = EXCLUDED.plan,
         current_period_end = EXCLUDED.current_period_end,
         cancel_at_period_end = EXCLUDED.cancel_at_period_end,
         past_due_since = CASE
           WHEN EXCLUDED.status = 'past_due' THEN COALESCE(subscriptions.past_due_since, EXCLUDED.past_due_since)
           ELSE NULL
         END`,
      [userId, subscriptionId, status, planFor(object, deps), subscriptionPeriodEnd(object),
        object.cancel_at_period_end === true, deps.clock.now()],
    );
    return;
  }

  if (event.type === "invoice.payment_failed" || event.type === "invoice.paid") {
    const subscriptionId = subscriptionIdFromInvoice(object);
    if (!subscriptionId) return;
    const [existing] = await deps.db.query<Pick<SubscriptionRow, "user_id"> & Record<string, unknown>>(
      "SELECT user_id FROM subscriptions WHERE stripe_subscription_id = $1",
      [subscriptionId],
    );
    const userId = existing?.user_id ?? await findUserId(
      deps.db,
      accountIdFromMetadata(object),
      stringField(object.customer),
    );
    if (!userId) return;
    const status: SubscriptionStatus = event.type === "invoice.payment_failed" ? "past_due" : "active";
    await deps.db.query(
      `INSERT INTO subscriptions
        (user_id, stripe_subscription_id, status, plan, cancel_at_period_end, past_due_since)
       VALUES ($1, $2, $3, NULL, false, CASE WHEN $3 = 'past_due' THEN $4::timestamptz ELSE NULL END)
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         status = EXCLUDED.status,
         past_due_since = CASE
           WHEN EXCLUDED.status = 'past_due' THEN COALESCE(subscriptions.past_due_since, EXCLUDED.past_due_since)
           ELSE NULL
         END`,
      [userId, subscriptionId, status, deps.clock.now()],
    );
  }
}

async function ensureCustomer(deps: AppDeps, user: { id: string; email: string; stripe_customer_id: string | null }) {
  if (user.stripe_customer_id) return user.stripe_customer_id;
  const customer = await deps.billing!.createCustomer(user.email, user.id);
  await deps.db.query("UPDATE users SET stripe_customer_id = $2 WHERE id = $1", [user.id, customer.id]);
  return customer.id;
}

export function registerBillingRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.post("/v1/billing/checkout", async (c) => {
    if (!deps.billing || !deps.stripePriceMonthly || !deps.stripePriceYearly) {
      return error(c, 503, "billing_unavailable", "Billing is not configured.");
    }
    const body = await jsonBody(c);
    if (body?.plan !== "monthly" && body?.plan !== "yearly") {
      return error(c, 400, "invalid_request", "Plan must be monthly or yearly.");
    }
    const user = c.get("session").user;
    const customerId = await ensureCustomer(deps, user);
    const checkout = await deps.billing.createCheckout({
      customerId,
      accountId: user.id,
      priceId: body.plan === "monthly" ? deps.stripePriceMonthly : deps.stripePriceYearly,
    });
    if (!checkout.url) return error(c, 503, "billing_unavailable", "Stripe did not return a checkout URL.");
    return c.json({ url: checkout.url });
  });

  app.post("/v1/billing/portal", async (c) => {
    if (!deps.billing) return error(c, 503, "billing_unavailable", "Billing is not configured.");
    const user = c.get("session").user;
    const customerId = await ensureCustomer(deps, user);
    const portal = await deps.billing.createPortal(customerId);
    return c.json({ url: portal.url });
  });

  app.post("/v1/billing/webhook", async (c) => {
    if (!deps.billing || !deps.stripeWebhookSecret) {
      return error(c, 503, "billing_unavailable", "Billing is not configured.");
    }
    const signature = c.req.header("stripe-signature");
    if (!signature) return error(c, 400, "invalid_signature", "The Stripe signature is missing.");
    const rawBody = await c.req.text();
    let event: StripeEvent;
    try {
      event = deps.billing.constructEvent(rawBody, signature, deps.stripeWebhookSecret);
    } catch {
      return error(c, 400, "invalid_signature", "The Stripe signature is invalid.");
    }

    await deps.db.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string }>(
        "INSERT INTO stripe_events (id) VALUES ($1) ON CONFLICT (id) DO NOTHING RETURNING id",
        [event.id],
      );
      if (inserted.length === 0) return;
      await handleStripeEvent(event, { ...deps, db: tx });
    });
    return c.json({ received: true });
  });
}
