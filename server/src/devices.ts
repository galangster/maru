import type { Hono } from "hono";
import { error } from "./http.js";
import type { AppEnv } from "./session.js";
import type { AppDeps } from "./types.js";
import { asDate } from "./util.js";

interface DeviceRow extends Record<string, unknown> {
  id: string;
  name: string;
  platform: string;
  family: string;
  created_at: Date | string;
  last_seen_at: Date | string;
}

export function registerDeviceRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get("/v1/devices", async (c) => {
    const session = c.get("session");
    const devices = await deps.db.query<DeviceRow>(
      `SELECT id, name, platform, family, created_at, last_seen_at
         FROM devices WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at`,
      [session.user.id],
    );
    return c.json({
      devices: devices.map((device) => ({
        id: device.id,
        name: device.name,
        platform: device.platform,
        family: device.family,
        createdAt: asDate(device.created_at)?.toISOString(),
        lastSeenAt: asDate(device.last_seen_at)?.toISOString(),
        current: device.id === session.deviceId,
      })),
    });
  });

  app.delete("/v1/devices/:id", async (c) => {
    const session = c.get("session");
    const rows = await deps.db.query<{ id: string }>(
      `UPDATE devices SET revoked_at = $3
        WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id`,
      [c.req.param("id"), session.user.id, deps.clock.now()],
    );
    return rows.length > 0
      ? c.json({ ok: true })
      : error(c, 404, "not_found", "The device does not exist.");
  });
}
