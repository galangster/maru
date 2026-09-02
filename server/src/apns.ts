import { connect, constants as http2Constants, type ClientHttp2Session } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import type { Logger } from "pino";
import type { ApnsAlert, ApnsResult, PushSender } from "./types.js";
import { isRecord } from "./util.js";

interface ApnsPush {
  payload: string;
  pushType: "background" | "alert";
  priority: "5" | "10";
}

// The relay push carries no content and never wakes the screen.
const BACKGROUND_PUSH: ApnsPush = {
  payload: JSON.stringify({ aps: { "content-available": 1 } }),
  pushType: "background",
  priority: "5",
};

// An alert push carries a visible title and body, so it arrives on a locked
// phone. `content-available` keeps the background wake the relay already sends.
export function alertPush(alert: ApnsAlert): ApnsPush {
  return {
    payload: JSON.stringify({
      aps: { alert: { title: alert.title, body: alert.body }, "content-available": 1 },
    }),
    pushType: "alert",
    priority: "10",
  };
}

// APNs answers a rejection with a small JSON body naming the reason.
function apnsReason(body: string) {
  if (!body) return undefined;
  try {
    const parsed: unknown = JSON.parse(body);
    const reason = isRecord(parsed) ? parsed.reason : undefined;
    return typeof reason === "string" ? reason : undefined;
  } catch {
    return undefined;
  }
}

export interface ApnsOptions {
  teamId: string;
  keyId: string;
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  bundleId: string;
  environment: "sandbox" | "production";
}

export class ApnsSender implements PushSender {
  private cachedToken: { value: string; issuedAt: number } | null = null;
  private session: ClientHttp2Session | null = null;

  constructor(private readonly options: ApnsOptions, private readonly logger: Logger) {}

  async send(tokens: string[]) {
    if (tokens.length === 0) return;
    const providerToken = await this.providerToken();
    const session = this.http2Session();
    const results = await Promise.all(tokens.map((token) => this.sendOne(session, token, providerToken, BACKGROUND_PUSH)));
    const failed = results.filter((result) => result.status !== 200).length;
    this.logger.info({ code: "apns_batch", count: tokens.length, failed }, "APNs batch complete");
  }

  async sendAlert(token: string, alert: ApnsAlert): Promise<ApnsResult> {
    const providerToken = await this.providerToken();
    const result = await this.sendOne(this.http2Session(), token, providerToken, alertPush(alert));
    this.logger.info({ code: "apns_alert", status: result.status, reason: result.reason }, "APNs alert complete");
    return result;
  }

  private http2Session() {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const authority = this.options.environment === "production"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
    const session = connect(authority);
    this.session = session;
    const clear = () => {
      if (this.session === session) this.session = null;
    };
    session.once("close", clear);
    session.once("goaway", () => {
      clear();
      session.close();
    });
    session.once("error", (cause) => {
      clear();
      this.logger.warn({ code: "apns_session_error", cause }, "APNs session closed after an error");
    });
    return session;
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

  private sendOne(session: ClientHttp2Session, deviceToken: string, providerToken: string, push: ApnsPush) {
    return new Promise<ApnsResult>((resolve, reject) => {
      const request = session.request({
        [http2Constants.HTTP2_HEADER_METHOD]: "POST",
        [http2Constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken}`,
        "apns-topic": this.options.bundleId,
        "apns-push-type": push.pushType,
        "apns-priority": push.priority,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(push.payload),
      });
      let status = 0;
      let body = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[http2Constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      request.on("data", (chunk: string) => {
        if (body.length < 1024) body += chunk;
      });
      request.on("end", () => {
        const reason = apnsReason(body);
        resolve(reason === undefined ? { status } : { status, reason });
      });
      request.on("error", reject);
      request.setTimeout(10_000, () => request.destroy(new Error("APNs request timed out")));
      request.end(push.payload);
    });
  }
}
