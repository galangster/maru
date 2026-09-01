import { connect, constants as http2Constants, type ClientHttp2Session } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import type { Logger } from "pino";
import type { PushSender } from "./types.js";

const APNS_PAYLOAD = JSON.stringify({ aps: { "content-available": 1 } });

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
    const statuses = await Promise.all(tokens.map((token) => this.sendOne(session, token, providerToken)));
    const failed = statuses.filter((status) => status !== 200).length;
    this.logger.info({ code: "apns_batch", count: tokens.length, failed }, "APNs batch complete");
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
