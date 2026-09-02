import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import { describe, expect, it, vi } from "vitest";
import { createPubSubVerifier } from "../src/push.js";
import type { PubSubVerifier, PushSender } from "../src/types.js";
import { allow, bearer, close, fixture, signup } from "./helpers.js";

describe("Gmail push relay", () => {
  it("rejects a bad JWT and accepts a locally signed matching JWT", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    jwk.kid = "test-key";
    jwk.alg = "ES256";
    const pubSubVerifier = createPubSubVerifier({
      audience: "https://sync.test/v1/push/gmail",
      serviceAccount: "pubsub@example.iam.gserviceaccount.com",
      jwks: createLocalJWKSet({ keys: [jwk] }),
    });
    const send = vi.fn(async () => undefined);
    const pushSender: PushSender = { send };
    const value = await fixture({ pubSubVerifier, pushSender });
    close.push(() => value.db.close());
    await allow(value.db);
    const created = await signup(value.app);
    await value.app.request("/v1/push/register", {
      method: "POST",
      headers: bearer(created.body.token),
      body: JSON.stringify({ apnsToken: "apns-device-token" }),
    });
    await value.app.request("/v1/push/watch", {
      method: "POST",
      headers: bearer(created.body.token),
      body: JSON.stringify({ email: "gmail@example.com", expiration: "2026-09-02T12:00:00Z" }),
    });

    const body = JSON.stringify({
      message: {
        data: Buffer.from(JSON.stringify({ emailAddress: "gmail@example.com", historyId: "1234" })).toString("base64"),
      },
    });
    const bad = await value.app.request("/v1/push/gmail", {
      method: "POST",
      headers: { authorization: "Bearer bad-token", "content-type": "application/json" },
      body,
    });
    expect(bad.status).toBe(401);

    const token = await new SignJWT({
      email: "pubsub@example.iam.gserviceaccount.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setIssuer("https://accounts.google.com")
      .setAudience("https://sync.test/v1/push/gmail")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const good = await value.app.request("/v1/push/gmail", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
    });
    expect(good.status).toBe(204);
    // Gmail's real notifications carry historyId as a JSON number.
    const numeric = await value.app.request("/v1/push/gmail", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: { data: Buffer.from(JSON.stringify({ emailAddress: "gmail@example.com", historyId: 6493 })).toString("base64") },
      }),
    });
    expect(numeric.status).toBe(204);
    await new Promise((resolve) => setImmediate(resolve));
    expect(send).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(["apns-device-token"]));
  });

  it("returns 204 for malformed Pub/Sub data after valid authentication", async () => {
    const pubSubVerifier: PubSubVerifier = { verify: vi.fn(async () => undefined) };
    const pushSender: PushSender = { send: vi.fn(async () => undefined) };
    const value = await fixture({ pubSubVerifier, pushSender });
    close.push(() => value.db.close());
    const response = await value.app.request("/v1/push/gmail", {
      method: "POST",
      headers: { authorization: "Bearer accepted", "content-type": "application/json" },
      body: JSON.stringify({ message: { data: "not-json" } }),
    });
    expect(response.status).toBe(204);
    expect(pushSender.send).not.toHaveBeenCalled();
  });
});

