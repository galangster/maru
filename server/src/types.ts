import type { Logger } from "pino";
import type { Db } from "./db.js";
import type { Entitlement } from "./entitlement.js";

export type Kdf = { algo: "argon2id"; m: number; t: number; p: number };
export type Family = "desktop" | "ios";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "ended";

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

export type SessionUserRow = Pick<
  UserRow,
  "id" | "email" | "auth_hash" | "rec_auth_hash" | "trial_ends_at" | "comped" | "stripe_customer_id" | "created_at"
>;

export interface SubscriptionRow extends Record<string, unknown> {
  user_id: string;
  stripe_subscription_id: string;
  status: SubscriptionStatus;
  plan: string | null;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean;
  past_due_since: Date | string | null;
}

export interface Session {
  user: SessionUserRow;
  deviceId: string;
  subscription: SubscriptionRow | null;
}

export interface AppVariables {
  session: Session;
  entitlement: Entitlement;
}

export type AppEnv = { Variables: AppVariables };

export interface Clock {
  now(): Date;
}

export interface AppDeps {
  db: Db;
  logger: Logger;
  clock: Clock;
  version: string;
  rateLimiter: RateLimiter;
  pushTestLimiter: KeyedLimiter;
  pubSubVerifier: PubSubVerifier;
  pushSender: PushSender;
  billing: BillingClient | null;
  stripeWebhookSecret: string | undefined;
  stripePriceMonthly: string | undefined;
  stripePriceYearly: string | undefined;
}

export interface RateLimiter {
  consume(email: string, ip: string): boolean;
}

export interface PubSubVerifier {
  verify(token: string): Promise<void>;
}

export interface ApnsAlert {
  title: string;
  body: string;
}

export interface ApnsResult {
  status: number;
  reason: string | null;
}

export interface PushSender {
  // False when APNs is not configured: sends are skipped and
  // POST /v1/push/test answers 503 push_unavailable.
  readonly configured: boolean;
  send(tokens: string[]): Promise<void>;
  sendAlert(token: string, alert: ApnsAlert): Promise<ApnsResult>;
}

export interface KeyedLimiter {
  consume(key: string): boolean;
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
