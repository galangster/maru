import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Context } from "hono";
import { isRecord } from "./util.js";

export function error(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return c.json({ error: code, message, ...extra }, status);
}

export async function jsonBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await c.req.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}
