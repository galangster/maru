import type { Hono } from "hono";
import { verifyProof } from "./crypto.js";
import { error, jsonBody } from "./http.js";
import type { AppEnv } from "./session.js";
import type { AppDeps } from "./types.js";
import { isBase64UrlBytes } from "./util.js";

export function registerAccountRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.delete("/v1/account", async (c) => {
    const body = await jsonBody(c);
    const user = c.get("session").user;
    if (!isBase64UrlBytes(body?.authKey, 32)) {
      return error(c, 400, "invalid_request", "An auth key is required.");
    }
    if (!(await verifyProof(user.auth_hash, body.authKey))) {
      return error(c, 401, "bad_credentials", "The auth key is incorrect.");
    }
    await deps.db.query("DELETE FROM users WHERE id = $1", [user.id]);
    return c.json({ ok: true });
  });
}
