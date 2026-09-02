import type { JWTVerifyGetKey } from "jose";
import { createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";
import type { Logger } from "pino";
import type { Hono } from "hono";
import { ApnsSender } from "./apns.js";
import { PUSH_TEST_RATE_LIMIT_CAPACITY, RATE_LIMIT_REFILL_MS } from "./constants.js";
import { error, jsonBody } from "./http.js";
import { KeyedRateLimiter } from "./ratelimit.js";
import type { AppDeps, AppEnv, PubSubVerifier, PushSender } from "./types.js";
import { isRecord, normalizeEmail, parseBearer } from "./util.js";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

// The only push the relay gives content. The content is fixed, so no mail
// data can reach it.
const TEST_PUSH_TITLE = "Maru";
const TEST_PUSH_BODY = "Test notification from your Maru account";

export interface PubSubVerifierOptions {
  audience: string;
  serviceAccount: string;
  jwks?: JWTVerifyGetKey;
}

export function createPubSubVerifier(options: PubSubVerifierOptions): PubSubVerifier {
  const jwks = options.jwks ?? createRemoteJWKSet(new URL(GOOGLE_JWKS));
  return {
    async verify(token: string) {
      const { payload } = await jwtVerify(token, jwks, {
        audience: options.audience,
        issuer: GOOGLE_ISSUER,
      });
      if (payload.email !== options.serviceAccount || payload.email_verified === false) {
        throw new Error("Unexpected Pub/Sub service account");
      }
    },
  };
}

export async function createPushServices(
  env: NodeJS.ProcessEnv,
  logger: Logger,
): Promise<{ pubSubVerifier: PubSubVerifier; pushSender: PushSender }> {
  const pubSubVerifier = env.PUBSUB_AUDIENCE && env.PUBSUB_SERVICE_ACCOUNT
    ? createPubSubVerifier({ audience: env.PUBSUB_AUDIENCE, serviceAccount: env.PUBSUB_SERVICE_ACCOUNT })
    : { async verify() { throw new Error("Pub/Sub verification is not configured"); } };

  const apnsPresent = env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_KEY_P8;
  if (!apnsPresent) {
    return {
      pubSubVerifier,
      pushSender: {
        async send(tokens) {
          logger.info({ code: "apns_unconfigured", count: tokens.length }, "APNs send skipped");
        },
      },
    };
  }

  if (env.APNS_ENV && env.APNS_ENV !== "sandbox" && env.APNS_ENV !== "production") {
    throw new Error("APNS_ENV must be sandbox or production");
  }

  const privateKey = await importPKCS8(env.APNS_KEY_P8!.replaceAll("\\n", "\n"), "ES256");
  const pushSender = new ApnsSender({
    teamId: env.APNS_TEAM_ID!,
    keyId: env.APNS_KEY_ID!,
    privateKey,
    bundleId: env.APNS_BUNDLE_ID ?? "app.getmaru.ios",
    environment: env.APNS_ENV === "production" ? "production" : "sandbox",
  }, logger);
  return { pubSubVerifier, pushSender };
}

function watchExpiration(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : Number.NaN;
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function registerPushRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  const testPushLimit = new KeyedRateLimiter(
    () => deps.clock.now().getTime(),
    PUSH_TEST_RATE_LIMIT_CAPACITY,
    RATE_LIMIT_REFILL_MS,
  );

  app.post("/v1/push/register", async (c) => {
    const body = await jsonBody(c);
    if (body?.apnsToken !== null && (typeof body?.apnsToken !== "string" || body.apnsToken.length === 0 || body.apnsToken.length > 512)) {
      return error(c, 400, "invalid_request", "The APNs token is invalid.");
    }
    await deps.db.query("UPDATE devices SET apns_token = $2 WHERE id = $1", [
      c.get("session").deviceId,
      body.apnsToken,
    ]);
    return c.json({ ok: true });
  });

  app.post("/v1/push/watch", async (c) => {
    const body = await jsonBody(c);
    const expiration = watchExpiration(body?.expiration);
    if (typeof body?.email !== "string" || !normalizeEmail(body.email) || !expiration || expiration <= deps.clock.now()) {
      return error(c, 400, "invalid_request", "The watch request is invalid.");
    }
    await deps.db.query(
      `INSERT INTO watches (user_id, email_address, expires_at) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, email_address) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
      [c.get("session").user.id, normalizeEmail(body.email), expiration],
    );
    return c.json({ ok: true });
  });

  app.post("/v1/push/test", async (c) => {
    const { deviceId } = c.get("session");
    if (!testPushLimit.consume(deviceId)) return error(c, 429, "rate_limited", "Try again later.");

    const { pushSender } = deps;
    if (!pushSender.sendAlert) return error(c, 503, "push_unavailable", "APNs is not configured.");

    const [row] = await deps.db.query<{ apns_token: string | null }>(
      "SELECT apns_token FROM devices WHERE id = $1",
      [deviceId],
    );
    if (!row?.apns_token) return error(c, 404, "no_token", "This device has not registered an APNs token.");

    const apns = await pushSender.sendAlert(row.apns_token, { title: TEST_PUSH_TITLE, body: TEST_PUSH_BODY });
    if (apns.status === 200) {
      deps.logger.info({ code: "push_test" }, "Test push sent");
      return c.json({ ok: true, sent: true });
    }
    // Apple's reason is the only useful diagnostic, so it travels to the phone
    // in a 200 body rather than dying in a server error.
    deps.logger.warn({ code: "push_test_rejected", status: apns.status, reason: apns.reason }, "Test push rejected");
    return c.json({ ok: false, sent: false, apns: { status: apns.status, reason: apns.reason ?? null } });
  });

  app.post("/v1/push/gmail", async (c) => {
    const token = parseBearer(c.req.header("authorization"));
    if (!token) return error(c, 401, "invalid_token", "A Pub/Sub bearer token is required.");
    try {
      await deps.pubSubVerifier.verify(token);
    } catch {
      return error(c, 401, "invalid_token", "The Pub/Sub token is invalid.");
    }

    const body = await jsonBody(c);
    try {
      const message = isRecord(body?.message) ? body.message : null;
      if (typeof message?.data !== "string") throw new Error("Missing data");
      const decoded: unknown = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
      if (!isRecord(decoded)) throw new Error("Invalid data");
      const data = decoded;
      // Gmail sends historyId as a JSON number in real notifications and as a
      // string in its documentation; accept both.
      if (typeof data.emailAddress !== "string" || !["string", "number"].includes(typeof data.historyId)) throw new Error("Invalid data");
      const email = normalizeEmail(data.emailAddress);
      setImmediate(() => {
        void fanOut(email, deps).catch((cause) => {
          deps.logger.error({ code: "gmail_push_failed", cause }, "Gmail push fan-out failed");
        });
      });
    } catch {
      deps.logger.warn({ code: "gmail_push_invalid" }, "Gmail push ignored");
    }
    return c.body(null, 204);
  });
}

async function fanOut(email: string, deps: AppDeps) {
  const rows = await deps.db.query<{ apns_token: string }>(
    `SELECT d.apns_token
       FROM watches w
       JOIN devices d ON d.user_id = w.user_id
      WHERE w.email_address = $1 AND w.expires_at > $2
        AND d.revoked_at IS NULL AND d.apns_token IS NOT NULL`,
    [email, deps.clock.now()],
  );
  await deps.pushSender.send(rows.map((row) => row.apns_token));
  deps.logger.info({ code: "gmail_push", count: rows.length }, "Gmail push relayed");
}
