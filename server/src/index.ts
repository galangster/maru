import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import pino from "pino";
import { createApp } from "./app.js";
import { seedAllowlist } from "./allowlist.js";
import { createStripeClient } from "./billing.js";
import { createPostgresDb, migrate } from "./db.js";
import { createPushService } from "./push.js";
import { TokenBucketRateLimiter } from "./ratelimit.js";

const logger = pino();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as { version: string };
const db = createPostgresDb(databaseUrl);
await migrate(db);
const seeded = await seedAllowlist(db, process.env.MARU_ALLOWLIST);
logger.info({ code: "allowlist_seed", count: seeded }, "Allowlist seed complete");

const push = await createPushService(process.env, logger);
const billing = process.env.STRIPE_SECRET_KEY ? createStripeClient(process.env.STRIPE_SECRET_KEY) : null;
const port = Number(process.env.PORT ?? 8787);
const app = createApp({
  db,
  logger,
  clock: { now: () => new Date() },
  version: packageJson.version,
  rateLimiter: new TokenBucketRateLimiter(),
  push,
  billing,
  ...(process.env.STRIPE_WEBHOOK_SECRET ? { stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET } : {}),
  ...(process.env.STRIPE_PRICE_MONTHLY ? { stripePriceMonthly: process.env.STRIPE_PRICE_MONTHLY } : {}),
  ...(process.env.STRIPE_PRICE_YEARLY ? { stripePriceYearly: process.env.STRIPE_PRICE_YEARLY } : {}),
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info({ code: "server_listen", port: info.port }, "Maru sync server listening");
});

async function shutdown(signal: string) {
  logger.info({ code: "server_shutdown", signal }, "Maru sync server stopping");
  server.close();
  await db.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
