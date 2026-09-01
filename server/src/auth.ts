import { randomUUID } from "node:crypto";
import type { Hono } from "hono";
import { allowlistStatus } from "./allowlist.js";
import { DEFAULT_KDF, TRIAL_DAYS } from "./constants.js";
import { hashProof, verifyProof } from "./crypto.js";
import { error, jsonBody } from "./http.js";
import type { AppEnv } from "./session.js";
import type { AppDeps, Family, Kdf, UserRow } from "./types.js";
import { addDays, clientSalt, isBase64UrlBytes, issueSessionToken, normalizeEmail, tokenHash } from "./util.js";

interface DeviceInput {
  name: string;
  platform: string;
  family: Family;
}

function deviceInput(value: unknown): DeviceInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.name !== "string" || record.name.trim().length === 0 || record.name.length > 120 ||
    typeof record.platform !== "string" || record.platform.trim().length === 0 || record.platform.length > 60 ||
    (record.family !== "desktop" && record.family !== "ios")
  ) return null;
  return { name: record.name.trim(), platform: record.platform.trim(), family: record.family };
}

function wrapped(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 8192;
}

function validKdf(value: unknown): value is Kdf {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const kdf = value as Record<string, unknown>;
  return kdf.algo === "argon2id" && kdf.m === 65_536 && kdf.t === 3 && kdf.p === 4;
}

function clientIp(headers: { get(name: string): string | null | undefined }) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

async function createDevice(deps: AppDeps, userId: string, device: DeviceInput) {
  const token = issueSessionToken();
  const deviceId = randomUUID();
  const now = deps.clock.now();
  await deps.db.query(
    `INSERT INTO devices (id, user_id, name, platform, family, token_hash, created_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
    [deviceId, userId, device.name, device.platform, device.family, tokenHash(token), now],
  );
  return { token, deviceId };
}

function limited(deps: AppDeps, email: string, headers: { get(name: string): string | null | undefined }) {
  return !deps.rateLimiter.consume(email, clientIp(headers));
}

export function registerAuthRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.post("/v1/auth/prelogin", async (c) => {
    const body = await jsonBody(c);
    if (typeof body?.email !== "string") return error(c, 400, "invalid_request", "Email is required.");
    const email = normalizeEmail(body.email);
    const [user] = await deps.db.query<Pick<UserRow, "kdf_json"> & Record<string, unknown>>(
      "SELECT kdf_json FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    );
    return c.json({ kdf: user?.kdf_json ?? DEFAULT_KDF, salt: clientSalt(email) });
  });

  app.post("/v1/auth/signup", async (c) => {
    const body = await jsonBody(c);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (limited(deps, email, c.req.raw.headers)) return error(c, 429, "rate_limited", "Try again later.");
    const device = deviceInput(body?.device);
    if (
      !email || !isBase64UrlBytes(body?.authKey, 32) || !isBase64UrlBytes(body?.recAuthKey, 32) ||
      !validKdf(body?.kdf) || !wrapped(body?.wrappedByPassword) || !wrapped(body?.wrappedByRecovery) || !device
    ) return error(c, 400, "invalid_request", "The signup request is invalid.");

    const gate = await allowlistStatus(deps.db, email);
    if (gate.enforced && !gate.allowed) return error(c, 403, "not_allowed", "This email is not in the beta.");
    const [existing] = await deps.db.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    );
    if (existing) return error(c, 409, "exists", "An account already exists.");

    const id = randomUUID();
    const now = deps.clock.now();
    const [authHash, recAuthHash] = await Promise.all([hashProof(body.authKey), hashProof(body.recAuthKey)]);
    const created = await deps.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO users
          (id, email, auth_hash, rec_auth_hash, kdf_json, wrapped_by_password, wrapped_by_recovery,
           trial_ends_at, comped, created_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)`,
        [id, email, authHash, recAuthHash, JSON.stringify(body.kdf), body.wrappedByPassword,
          body.wrappedByRecovery, addDays(now, TRIAL_DAYS), gate.allowed, now],
      );
      return createDevice({ ...deps, db: tx }, id, device);
    });
    return c.json({ ...created, accountId: id }, 201);
  });

  app.post("/v1/auth/login", async (c) => {
    const body = await jsonBody(c);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (limited(deps, email, c.req.raw.headers)) return error(c, 429, "rate_limited", "Try again later.");
    const device = deviceInput(body?.device);
    if (!email || !isBase64UrlBytes(body?.authKey, 32) || !device) {
      return error(c, 400, "invalid_request", "The login request is invalid.");
    }
    const [user] = await deps.db.query<UserRow>(
      "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    );
    if (!user || !(await verifyProof(user.auth_hash, body.authKey))) {
      return error(c, 401, "bad_credentials", "The email or auth key is incorrect.");
    }
    const created = await createDevice(deps, user.id, device);
    return c.json({
      ...created,
      accountId: user.id,
      kdf: user.kdf_json,
      wrappedByPassword: user.wrapped_by_password,
    });
  });

  app.post("/v1/auth/recover", async (c) => {
    const body = await jsonBody(c);
    const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
    if (limited(deps, email, c.req.raw.headers)) return error(c, 429, "rate_limited", "Try again later.");
    const device = deviceInput(body?.device);
    if (
      !email || !isBase64UrlBytes(body?.recAuthKey, 32) || !isBase64UrlBytes(body?.newAuthKey, 32) ||
      !isBase64UrlBytes(body?.newRecAuthKey, 32) || !wrapped(body?.newWrappedByPassword) ||
      !wrapped(body?.newWrappedByRecovery) || !device
    ) return error(c, 400, "invalid_request", "The recovery request is invalid.");
    const [user] = await deps.db.query<UserRow>(
      "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    );
    if (!user || !(await verifyProof(user.rec_auth_hash, body.recAuthKey))) {
      return error(c, 401, "bad_credentials", "The recovery key is incorrect.");
    }

    const [newAuthHash, newRecHash] = await Promise.all([
      hashProof(body.newAuthKey),
      hashProof(body.newRecAuthKey),
    ]);
    const result = await deps.db.transaction(async (tx) => {
      const now = deps.clock.now();
      await tx.query("UPDATE devices SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL", [user.id, now]);
      await tx.query(
        `UPDATE users SET auth_hash = $2, rec_auth_hash = $3, wrapped_by_password = $4,
                          wrapped_by_recovery = $5 WHERE id = $1`,
        [user.id, newAuthHash, newRecHash, body.newWrappedByPassword, body.newWrappedByRecovery],
      );
      return createDevice({ ...deps, db: tx }, user.id, device);
    });
    return c.json({ ...result, accountId: user.id, wrappedByRecovery: user.wrapped_by_recovery });
  });

  app.post("/v1/auth/password", async (c) => {
    const body = await jsonBody(c);
    const session = c.get("session");
    if (!isBase64UrlBytes(body?.authKey, 32) || !isBase64UrlBytes(body?.newAuthKey, 32) || !wrapped(body?.newWrappedByPassword)) {
      return error(c, 400, "invalid_request", "The password request is invalid.");
    }
    if (!(await verifyProof(session.user.auth_hash, body.authKey))) {
      return error(c, 401, "bad_credentials", "The auth key is incorrect.");
    }
    const newHash = await hashProof(body.newAuthKey);
    await deps.db.query(
      "UPDATE users SET auth_hash = $2, wrapped_by_password = $3 WHERE id = $1",
      [session.user.id, newHash, body.newWrappedByPassword],
    );
    return c.json({ ok: true });
  });

  app.post("/v1/auth/logout", async (c) => {
    const session = c.get("session");
    await deps.db.query("UPDATE devices SET revoked_at = $2 WHERE id = $1", [session.deviceId, deps.clock.now()]);
    return c.json({ ok: true });
  });
}
