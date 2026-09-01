import { connect, constants as http2Constants, type ClientHttp2Session } from "node:http2";
import type { JWTVerifyGetKey } from "jose";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import type { Logger } from "pino";
import type { Hono } from "hono";
import { requirePaidWrite } from "./access.js";
import { error, jsonBody } from "./http.js";
import type { AppEnv } from "./session.js";
import type { AppDeps, PushService } from "./types.js";
import { normalizeEmail, parseBearer } from "./util.js";

const GOOGLE_ISSUER = "https://accounts.google.com";
const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const APNS_PAYLOAD = JSON.stringify({ aps: { "content-available": 1 } });

export interface PubSubVerifierOptions {
  audience: string;
  serviceAccount: string;
  jwks?: JWTVerifyGetKey;
}

export function createPubSubVerifier(options: PubSubVerifierOptions) {
  const jwks = options.jwks ?? createRemoteJWKSet(new URL(GOOGLE_JWKS));
  return async (token: string) => {
    const { payload } = await jwtVerify(token, jwks, {
      audience: options.audience,
      issuer: GOOGLE_ISSUER,
    });
    if (payload.email !== options.serviceAccount || payload.email_verified === false) {
      throw new Error("Unexpected Pub/Sub service account");
    }
  };
}

interface ApnsOptions {
  teamId: string;
  keyId: string;
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  bundleId: string;
  environment: "sandbox" | "production";
}

class ApnsSender {
  private cachedToken: { value: string; issuedAt: number } | null = null;

  constructor(private readonly options: ApnsOptions, private readonly logger: Logger) {}

  async send(tokens: string[]) {
    if (tokens.length === 0) return;
    const authority = this.options.environment === "production"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
    const session = connect(authority);
    try {
      const providerToken = await this.providerToken();
      const statuses = await Promise.all(tokens.map((token) => this.sendOne(session, token, providerToken)));
      const failed = statuses.filter((status) => status !== 200).length;
      this.logger.info({ code: "apns_batch", count: tokens.length, failed }, "APNs batch complete");
    } finally {
      session.close();
    }
  }

  private async providerToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && now - this.cachedToken.issuedAt < 50 * 60) return this.cachedToken.value;
    const value = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.options.keyId })
      .setIssuer(this.options.teamId)
      .setIssuedAt(now)
      .sign(this.options.privateKey);
    this.cachedToken = { value, issuedAt: now };
    return value;
  }

  private sendOne(session: ClientHttp2Session, deviceToken: string, providerToken: string) {
    return new Promise<number>((resolve, reject) => {
      const request = session.request({
        [http2Constants.HTTP2_HEADER_METHOD]: "POST",
        [http2Constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": this.options.bundleId,
        "apns-push-type": "background",
        "apns-priority": "5",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(APNS_PAYLOAD),
      });
      let status = 0;
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[http2Constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      request.on("data", () => undefined);
      request.on("end", () => resolve(status));
      request.on("error", reject);
      request.setTimeout(10_000, () => request.destroy(new Error("APNs request timed out")));
      request.end(APNS_PAYLOAD);
    });
  }
}

export async function createPushService(env: NodeJS.ProcessEnv, logger: Logger): Promise<PushService> {
  const verifyPubSubToken = env.PUBSUB_AUDIENCE && env.PUBSUB_SERVICE_ACCOUNT
    ? createPubSubVerifier({ audience: env.PUBSUB_AUDIENCE, serviceAccount: env.PUBSUB_SERVICE_ACCOUNT })
    : async () => { throw new Error("Pub/Sub verification is not configured"); };

  const apnsPresent = env.APNS_TEAM_ID && env.APNS_KEY_ID && env.APNS_KEY_P8;
  if (!apnsPresent) {
    return {
      verifyPubSubToken,
      async send(tokens) {
        logger.info({ code: "apns_unconfigured", count: tokens.length }, "APNs send skipped");
      },
    };
  }

  const privateKey = await importPKCS8(env.APNS_KEY_P8!.replaceAll("\\n", "\n"), "ES256");
  const sender = new ApnsSender({
    teamId: env.APNS_TEAM_ID!,
    keyId: env.APNS_KEY_ID!,
    privateKey,
    bundleId: env.APNS_BUNDLE_ID ?? "app.getmaru.ios",
    environment: env.APNS_ENV === "production" ? "production" : "sandbox",
  }, logger);
  return { verifyPubSubToken, send: (tokens) => sender.send(tokens) };
}

function watchExpiration(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const numeric = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : Number.NaN;
  const date = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function registerPushRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.post("/v1/push/register", async (c) => {
    const denied = await requirePaidWrite(c, deps);
    if (denied) return denied;
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
    const denied = await requirePaidWrite(c, deps);
    if (denied) return denied;
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

  app.post("/v1/push/gmail", async (c) => {
    const token = parseBearer(c.req.header("authorization"));
    if (!token) return error(c, 401, "invalid_token", "A Pub/Sub bearer token is required.");
    try {
      await deps.push.verifyPubSubToken(token);
    } catch {
      return error(c, 401, "invalid_token", "The Pub/Sub token is invalid.");
    }

    const body = await jsonBody(c);
    try {
      const message = body?.message as Record<string, unknown> | undefined;
      if (typeof message?.data !== "string") throw new Error("Missing data");
      const decoded: unknown = JSON.parse(Buffer.from(message.data, "base64").toString("utf8"));
      if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("Invalid data");
      const data = decoded as Record<string, unknown>;
      if (typeof data.emailAddress !== "string" || typeof data.historyId !== "string") throw new Error("Invalid data");
      const rows = await deps.db.query<{ apns_token: string }>(
        `SELECT d.apns_token
           FROM watches w
           JOIN devices d ON d.user_id = w.user_id
          WHERE w.email_address = $1 AND w.expires_at > $2
            AND d.revoked_at IS NULL AND d.apns_token IS NOT NULL`,
        [normalizeEmail(data.emailAddress), deps.clock.now()],
      );
      await deps.push.send(rows.map((row) => row.apns_token));
      deps.logger.info({ code: "gmail_push", count: rows.length }, "Gmail push relayed");
    } catch (cause) {
      deps.logger.warn({ code: "gmail_push_invalid", count: 0 }, "Gmail push ignored");
    }
    return c.body(null, 204);
  });
}
