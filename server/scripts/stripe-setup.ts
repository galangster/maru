import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required");
const stripe = new Stripe(secretKey);
const lookupKeys = ["maru_sync_monthly", "maru_sync_yearly"];
const existing = await stripe.prices.list({ active: true, lookup_keys: lookupKeys, limit: 100 });

let productId = existing.data.map((price) => price.product).find((product): product is string => typeof product === "string");
if (!productId) {
  const products = await stripe.products.search({ query: "metadata['maru_product_key']:'maru_sync'", limit: 1 });
  productId = products.data[0]?.id;
}
if (!productId) {
  const product = await stripe.products.create({
    name: "Maru Sync",
    metadata: { maru_product_key: "maru_sync" },
  }, { idempotencyKey: "maru-sync-product-v1" });
  productId = product.id;
}
const stableProductId = productId;

async function ensurePrice(lookupKey: string, unitAmount: number, interval: "month" | "year") {
  const found = existing.data.find((price) => price.lookup_key === lookupKey);
  if (found) return found.id;
  const price = await stripe.prices.create({
    product: stableProductId,
    currency: "usd",
    unit_amount: unitAmount,
    recurring: { interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
  }, { idempotencyKey: `${lookupKey}-v1` });
  return price.id;
}

const monthly = await ensurePrice("maru_sync_monthly", 500, "month");
const yearly = await ensurePrice("maru_sync_yearly", 5_000, "year");
console.log(`STRIPE_PRICE_MONTHLY=${monthly}`);
console.log(`STRIPE_PRICE_YEARLY=${yearly}`);

// The webhook endpoint for spec §12. Stripe returns the signing secret only
// at creation, so it is printed once here and never again; re-running finds
// the endpoint by URL and prints nothing for it.
const webhookUrl = process.env.MARU_WEBHOOK_URL ?? "https://sync.getmaru.app/v1/billing/webhook";
const webhookEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
const endpoint = endpoints.data.find((item) => item.url === webhookUrl);
if (endpoint) {
  console.log(`# webhook endpoint exists: ${endpoint.id} (${webhookUrl}); its secret is only shown at creation`);
} else {
  const created = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: webhookEvents,
    description: "Maru sync relay (spec §12)",
  }, { idempotencyKey: `maru-webhook-${webhookUrl}` });
  console.log(`STRIPE_WEBHOOK_SECRET=${created.secret ?? ""}`);
}
