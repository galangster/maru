import { PGlite } from "@electric-sql/pglite";
import pino from "pino";
import { vi } from "vitest";
import { createApp } from "../src/app.js";
import { createPgliteDb, migrate } from "../src/db.js";
import { TokenBucketRateLimiter } from "../src/ratelimit.js";
import type { AppDeps, BillingClient, PushService } from "../src/types.js";

export const EMAIL = "test@example.com";
export const AUTH_KEY = Buffer.alloc(32, 1).toString("base64url");
export const REC_KEY = Buffer.alloc(32, 2).toString("base64url");
export const NEW_AUTH_KEY = Buffer.alloc(32, 3).toString("base64url");
export const NEW_REC_KEY = Buffer.alloc(32, 4).toString("base64url");

export const device = (name = "Test Mac") => ({ name, platform: "macos", family: "desktop" });

export interface FixtureOptions {
  push?: PushService;
  billing?: BillingClient | null;
  stripeWebhookSecret?: string;
  stripePriceMonthly?: string;
  stripePriceYearly?: string;
}

export async function fixture(options: FixtureOptions = {}) {
  const client = new PGlite();
  const db = createPgliteDb(client);
  await migrate(db);
  const current = { value: new Date("2026-09-01T12:00:00.000Z") };
  const defaultPush: PushService = {
    send: vi.fn(async () => undefined),
    verifyPubSubToken: vi.fn(async () => undefined),
  };
  const deps: AppDeps = {
    db,
    logger: pino({ level: "silent" }),
    clock: { now: () => new Date(current.value) },
    version: "0.1.7-test",
    rateLimiter: new TokenBucketRateLimiter(() => current.value.getTime()),
    push: options.push ?? defaultPush,
    billing: options.billing ?? null,
    ...(options.stripeWebhookSecret ? { stripeWebhookSecret: options.stripeWebhookSecret } : {}),
    ...(options.stripePriceMonthly ? { stripePriceMonthly: options.stripePriceMonthly } : {}),
    ...(options.stripePriceYearly ? { stripePriceYearly: options.stripePriceYearly } : {}),
  };
  return { app: createApp(deps), db, deps, current };
}

export async function allow(db: AppDeps["db"], email = EMAIL) {
  await db.query("INSERT INTO allowed_emails (email) VALUES ($1)", [email]);
}

export async function signup(
  app: ReturnType<typeof createApp>,
  email = EMAIL,
  authKey = AUTH_KEY,
  recAuthKey = REC_KEY,
) {
  const response = await app.request("/v1/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.1" },
    body: JSON.stringify({
      email,
      authKey,
      recAuthKey,
      kdf: { algo: "argon2id", m: 65_536, t: 3, p: 4 },
      wrappedByPassword: "m1.password.wrapped",
      wrappedByRecovery: "m1.recovery.wrapped",
      device: device(),
    }),
  });
  return { response, body: await response.json() as { token: string; deviceId: string; accountId: string } };
}

export function bearer(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}
