import type { MiddlewareHandler } from "hono";
import { SESSION_IDLE_DAYS } from "./constants.js";
import { error } from "./http.js";
import type { AppDeps, AppVariables, UserRow } from "./types.js";
import { addDays, asDate, parseBearer, tokenHash } from "./util.js";

interface SessionRow extends UserRow {
  device_id: string;
  last_seen_at: Date | string;
  revoked_at: Date | string | null;
}

export type AppEnv = { Variables: AppVariables };

export function bearerSession(deps: AppDeps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = parseBearer(c.req.header("authorization"));
    if (!token) return error(c, 401, "unauthorized", "A bearer token is required.");

    const [row] = await deps.db.query<SessionRow>(
      `SELECT u.*, d.id AS device_id, d.last_seen_at, d.revoked_at
         FROM devices d
         JOIN users u ON u.id = d.user_id
        WHERE d.token_hash = $1 AND u.deleted_at IS NULL`,
      [tokenHash(token)],
    );
    if (!row) return error(c, 401, "unauthorized", "The session is not valid.");

    const now = deps.clock.now();
    const idleExpiresAt = addDays(asDate(row.last_seen_at) as Date, SESSION_IDLE_DAYS);
    if (row.revoked_at || now >= idleExpiresAt) {
      if (!row.revoked_at) {
        await deps.db.query("UPDATE devices SET revoked_at = $2 WHERE id = $1", [row.device_id, now]);
      }
      return error(c, 401, "revoked", "The session has been revoked.");
    }

    await deps.db.query("UPDATE devices SET last_seen_at = $2 WHERE id = $1", [row.device_id, now]);
    c.set("session", { user: row, deviceId: row.device_id });
    await next();
  };
}
