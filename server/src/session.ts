import type { MiddlewareHandler } from "hono";
import { SESSION_IDLE_DAYS, SESSION_TOUCH_MINUTES } from "./constants.js";
import { error } from "./http.js";
import type { AppDeps, AppEnv, SessionUserRow, SubscriptionRow } from "./types.js";
import { parseBearer, tokenHash } from "./util.js";

interface SessionRow extends SessionUserRow, Record<string, unknown> {
  device_id: string;
  revoked_at: Date | string | null;
  subscription_user_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionRow["status"] | null;
  subscription_plan: string | null;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean | null;
  past_due_since: Date | string | null;
}

export function bearerSession(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = parseBearer(c.req.header("authorization"));
    if (!token) return error(c, 401, "unauthorized", "A bearer token is required.");

    const [row] = await deps.db.query<SessionRow>(
      `UPDATE devices d
          SET revoked_at = CASE
                WHEN d.revoked_at IS NULL
                 AND d.last_seen_at <= $2::timestamptz - ($3::integer * interval '1 day') THEN $2
                ELSE d.revoked_at
              END,
              last_seen_at = CASE
                WHEN d.revoked_at IS NULL
                 AND d.last_seen_at > $2::timestamptz - ($3::integer * interval '1 day')
                 AND d.last_seen_at < $2::timestamptz - ($4::integer * interval '1 minute') THEN $2
                ELSE d.last_seen_at
              END
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
        WHERE d.token_hash = $1 AND u.id = d.user_id AND u.deleted_at IS NULL
        RETURNING u.id, u.email, u.auth_hash, u.rec_auth_hash, u.trial_ends_at,
                  u.comped, u.stripe_customer_id, u.created_at,
                  d.id AS device_id, d.revoked_at,
                  s.user_id AS subscription_user_id,
                  s.stripe_subscription_id, s.status AS subscription_status,
                  s.plan AS subscription_plan, s.current_period_end,
                  s.cancel_at_period_end, s.past_due_since`,
      [tokenHash(token), deps.clock.now(), SESSION_IDLE_DAYS, SESSION_TOUCH_MINUTES],
    );
    if (!row) return error(c, 401, "unauthorized", "The session is not valid.");

    if (row.revoked_at) return error(c, 401, "revoked", "The session has been revoked.");

    const subscription: SubscriptionRow | null = row.subscription_user_id ? {
      user_id: row.subscription_user_id,
      stripe_subscription_id: row.stripe_subscription_id!,
      status: row.subscription_status!,
      plan: row.subscription_plan,
      current_period_end: row.current_period_end,
      cancel_at_period_end: row.cancel_at_period_end ?? false,
      past_due_since: row.past_due_since,
    } : null;
    c.set("session", { user: row, deviceId: row.device_id, subscription });
    await next();
  };
}
