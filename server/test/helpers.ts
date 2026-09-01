import { PGlite } from "@electric-sql/pglite";
import pino from "pino";
import { afterEach, vi } from "vitest";
import { createApp } from "../src/app.js";
import { DEFAULT_KDF } from "../src/constants.js";
import { migrate } from "../src/db.js";
import { TokenBucketRateLimiter } from "../src/ratelimit.js";
import type { AppDeps, BillingClient, PubSubVerifier, PushSender } from "../src/types.js";
import { createPgliteDb } from "./pglite-db.js";

export const EMAIL = "test@example.com";
export const AUTH_KEY = Buffer.alloc(32, 1).toString("base64url");
export const REC_KEY = Buffer.alloc(32, 2).toString("base64url");
export const NEW_AUTH_KEY = Buffer.alloc(32, 3).toString("base64url");
export const NEW_REC_KEY = Buffer.alloc(32, 4).toString("base64url");

export const device = (name = "Test Mac") => ({ name, platform: "macos", family: "desktop" });

export interface FixtureOptions {
  pubSubVerifier?: PubSubVerifier;
  pushSender?: PushSender;
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
  const deps: AppDeps = {
    db,
    logger: pino({ level: "silent" }),
    clock: { now: () => new Date(current.value) },
    version: "0.1.7-test",
    rateLimiter: new TokenBucketRateLimiter(() => current.value.getTime()),
    pubSubVerifier: options.pubSubVerifier ?? { verify: vi.fn(async () => undefined) },
    pushSender: options.pushSender ?? { send: vi.fn(async () => undefined) },
    billing: options.billing ?? null,
    stripeWebhookSecret: options.stripeWebhookSecret,
    stripePriceMonthly: options.stripePriceMonthly,
    stripePriceYearly: options.stripePriceYearly,
  };
  return { app: createApp(deps), db, deps, current };
}

export const close: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(close.splice(0).map((fn) => fn())));

export async function ready(options: FixtureOptions = {}) {
  const value = await fixture(options);
  close.push(() => value.db.close());
  await allow(value.db);
  return value;
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
      kdf: DEFAULT_KDF,
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
