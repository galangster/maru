import { createHash, randomBytes } from "node:crypto";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function clientSalt(email: string) {
  return createHash("sha256").update(`maru-account-v1:${normalizeEmail(email)}`).digest("base64url");
}

export function issueSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function parseBearer(value: string | undefined) {
  if (!value?.startsWith("Bearer ")) return null;
  const token = value.slice(7);
  return token.length > 0 ? token : null;
}

export function asDate(value: Date | string | null | undefined) {
  return value == null ? null : value instanceof Date ? value : new Date(value);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

export function isBase64UrlBytes(value: unknown, bytes: number): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    return Buffer.from(value, "base64url").length === bytes;
  } catch {
    return false;
  }
}
