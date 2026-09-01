import { afterEach, describe, expect, it } from "vitest";
import { verifyProof } from "../src/crypto.js";
import {
  allow,
  AUTH_KEY,
  bearer,
  device,
  EMAIL,
  fixture,
  NEW_AUTH_KEY,
  NEW_REC_KEY,
  REC_KEY,
  signup,
} from "./helpers.js";

const close: Array<() => Promise<void>> = [];
afterEach(async () => Promise.all(close.splice(0).map((fn) => fn())));

async function ready() {
  const value = await fixture();
  close.push(() => value.db.close());
  await allow(value.db);
  return value;
}

describe("authentication", () => {
  it("signs up and logs in with the same auth key", async () => {
    const { app, db } = await ready();
    const created = await signup(app);
    expect(created.response.status).toBe(201);
    expect(Buffer.from(created.body.token, "base64url")).toHaveLength(32);

    const login = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.2" },
      body: JSON.stringify({ email: ` ${EMAIL.toUpperCase()} `, authKey: AUTH_KEY, device: device("Second Mac") }),
    });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ accountId: created.body.accountId, wrappedByPassword: "m1.password.wrapped" });
    const stored = (await db.query<{ token_hash: string }>("SELECT token_hash FROM devices LIMIT 1"))[0]!;
    expect(stored.token_hash).not.toBe(created.body.token);
    expect(stored.token_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same prelogin shape for known and unknown emails", async () => {
    const { app } = await ready();
    await signup(app);
    const known = await app.request("/v1/auth/prelogin", { method: "POST", body: JSON.stringify({ email: EMAIL }) });
    const unknown = await app.request("/v1/auth/prelogin", { method: "POST", body: JSON.stringify({ email: "other@example.com" }) });
    expect(Object.keys(await known.json() as object)).toEqual(Object.keys(await unknown.json() as object));
  });

  it("rejects signup outside the enforced allowlist", async () => {
    const { app } = await ready();
    const result = await signup(app, "blocked@example.com");
    expect(result.response.status).toBe(403);
    expect(result.body).toMatchObject({ error: "not_allowed" });
  });

  it("rejects a wrong auth key", async () => {
    const { app } = await ready();
    await signup(app);
    const response = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, authKey: NEW_AUTH_KEY, device: device() }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "bad_credentials" });
  });

  it("revokes old devices and rotates both hashes during recovery", async () => {
    const { app, db } = await ready();
    const first = await signup(app);
    const login = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.3" },
      body: JSON.stringify({ email: EMAIL, authKey: AUTH_KEY, device: device("Other") }),
    });
    const second = await login.json() as { token: string };
    const [before] = await db.query<{ auth_hash: string; rec_auth_hash: string }>("SELECT auth_hash, rec_auth_hash FROM users");
    const recovery = await app.request("/v1/auth/recover", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.4" },
      body: JSON.stringify({
        email: EMAIL,
        recAuthKey: REC_KEY,
        newAuthKey: NEW_AUTH_KEY,
        newWrappedByPassword: "m1.new-password.wrapped",
        newRecAuthKey: NEW_REC_KEY,
        newWrappedByRecovery: "m1.new-recovery.wrapped",
        device: device("Recovered"),
      }),
    });
    expect(recovery.status).toBe(200);
    expect(await recovery.clone().json()).toMatchObject({ wrappedByRecovery: "m1.recovery.wrapped" });
    for (const token of [first.body.token, second.token]) {
      expect((await app.request("/v1/devices", { headers: bearer(token) })).status).toBe(401);
    }
    const [after] = await db.query<{ auth_hash: string; rec_auth_hash: string }>("SELECT auth_hash, rec_auth_hash FROM users");
    expect(after!.auth_hash).not.toBe(before!.auth_hash);
    expect(after!.rec_auth_hash).not.toBe(before!.rec_auth_hash);
    expect(await verifyProof(after!.auth_hash, NEW_AUTH_KEY)).toBe(true);
    expect(await verifyProof(after!.rec_auth_hash, NEW_REC_KEY)).toBe(true);
  });

  it("rate limits the eleventh signup attempt by email and IP", async () => {
    const { app } = await ready();
    let response!: Response;
    for (let index = 0; index < 11; index += 1) {
      response = await app.request("/v1/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.8" },
        body: JSON.stringify({ email: "rate@example.com" }),
      });
    }
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: "rate_limited" });
  });

  it("expires a session after 365 idle days", async () => {
    const { app, db, current } = await ready();
    const created = await signup(app);
    await db.query("UPDATE devices SET last_seen_at = $1", [new Date("2025-09-01T11:59:59.999Z")]);
    current.value = new Date("2026-09-01T12:00:00.000Z");
    const response = await app.request("/v1/devices", { headers: bearer(created.body.token) });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "revoked" });
  });
});

describe("vaults and devices", () => {
  it("puts, gets, and returns the current blob on conflict", async () => {
    const { app } = await ready();
    const created = await signup(app);
    const put = await app.request("/v1/vault", {
      method: "PUT",
      headers: bearer(created.body.token),
      body: JSON.stringify({ baseVersion: 0, ciphertext: "m1.first.ciphertext" }),
    });
    expect(await put.json()).toEqual({ version: 1 });
    const get = await app.request("/v1/vault", { headers: bearer(created.body.token) });
    expect(await get.json()).toMatchObject({ version: 1, ciphertext: "m1.first.ciphertext" });
    const conflict = await app.request("/v1/vault", {
      method: "PUT",
      headers: bearer(created.body.token),
      body: JSON.stringify({ baseVersion: 0, ciphertext: "m1.stale.ciphertext" }),
    });
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: "conflict", version: 1, ciphertext: "m1.first.ciphertext" });
  });

  it("retains ten versions and restores an old ciphertext as a new version", async () => {
    const { app } = await ready();
    const created = await signup(app);
    for (let version = 0; version < 12; version += 1) {
      const response = await app.request("/v1/vault", {
        method: "PUT",
        headers: bearer(created.body.token),
        body: JSON.stringify({ baseVersion: version, ciphertext: `cipher-${version + 1}` }),
      });
      expect(response.status).toBe(200);
    }
    const history = await app.request("/v1/vault/history", { headers: bearer(created.body.token) });
    const historyBody = await history.json() as { versions: Array<{ version: number }> };
    expect(historyBody.versions.map((item) => item.version)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
    const restore = await app.request("/v1/vault/restore", {
      method: "POST",
      headers: bearer(created.body.token),
      body: JSON.stringify({ version: 3 }),
    });
    expect(await restore.json()).toEqual({ version: 13 });
    const current = await app.request("/v1/vault", { headers: bearer(created.body.token) });
    expect(await current.json()).toMatchObject({ version: 13, ciphertext: "cipher-3" });
  });

  it("revokes a named device and that token receives revoked", async () => {
    const { app } = await ready();
    const first = await signup(app);
    const login = await app.request("/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.9" },
      body: JSON.stringify({ email: EMAIL, authKey: AUTH_KEY, device: device("Phone") }),
    });
    const second = await login.json() as { token: string; deviceId: string };
    expect((await app.request(`/v1/devices/${second.deviceId}`, {
      method: "DELETE",
      headers: bearer(first.body.token),
    })).status).toBe(200);
    const revoked = await app.request("/v1/devices", { headers: bearer(second.token) });
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: "revoked" });
  });
});

describe("account deletion", () => {
  it("checks authKey and deletes all account-owned rows", async () => {
    const { app, db } = await ready();
    const created = await signup(app);
    const wrong = await app.request("/v1/account", {
      method: "DELETE",
      headers: bearer(created.body.token),
      body: JSON.stringify({ authKey: NEW_AUTH_KEY }),
    });
    expect(wrong.status).toBe(401);
    await app.request("/v1/vault", {
      method: "PUT",
      headers: bearer(created.body.token),
      body: JSON.stringify({ baseVersion: 0, ciphertext: "cipher" }),
    });
    await app.request("/v1/push/watch", {
      method: "POST",
      headers: bearer(created.body.token),
      body: JSON.stringify({ email: "mail@example.com", expiration: "2026-09-02T00:00:00Z" }),
    });
    await db.query(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, status)
       VALUES ($1, 'sub_delete', 'active')`,
      [created.body.accountId],
    );
    const deleted = await app.request("/v1/account", {
      method: "DELETE",
      headers: bearer(created.body.token),
      body: JSON.stringify({ authKey: AUTH_KEY }),
    });
    expect(deleted.status).toBe(200);
    for (const table of ["users", "devices", "vaults", "vault_history", "watches", "subscriptions"]) {
      const [row] = await db.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
      expect(row!.count, table).toBe("0");
    }
  });
});
