import type { Logger } from "pino";
import type { Db } from "./db.js";

export type Kdf = { algo: "argon2id"; m: number; t: number; p: number };
export type Family = "desktop" | "ios";

export interface UserRow extends Record<string, unknown> {
  id: string;
  email: string;
  auth_hash: string;
  rec_auth_hash: string;
  kdf_json: Kdf;
  wrapped_by_password: string;
  wrapped_by_recovery: string;
  trial_ends_at: Date | string;
  comped: boolean;
  stripe_customer_id: string | null;
  created_at: Date | string;
}

export interface SubscriptionRow extends Record<string, unknown> {
  user_id: string;
  stripe_subscription_id: string;
  status: string;
  plan: string | null;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean;
  past_due_since: Date | string | null;
}

export interface Session {
  user: UserRow;
  deviceId: string;
}

export interface AppVariables {
  session: Session;
}

export interface Clock {
  now(): Date;
}

export interface AppDeps {
  db: Db;
  logger: Logger;
  clock: Clock;
  version: string;
  rateLimiter: RateLimiter;
  push: PushService;
  billing: BillingClient | null;
  stripeWebhookSecret?: string;
  stripePriceMonthly?: string;
  stripePriceYearly?: string;
}

export interface RateLimiter {
  consume(email: string, ip: string): boolean;
}

export interface PushService {
  send(tokens: string[]): Promise<void>;
  verifyPubSubToken(token: string): Promise<void>;
}

export interface BillingClient {
  createCustomer(email: string, accountId: string): Promise<{ id: string }>;
  createCheckout(input: {
    customerId: string;
    accountId: string;
    priceId: string;
  }): Promise<{ url: string | null }>;
  createPortal(customerId: string): Promise<{ url: string }>;
  constructEvent(rawBody: string, signature: string, secret: string): StripeEvent;
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}
