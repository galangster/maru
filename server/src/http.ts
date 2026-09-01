import type { Context } from "hono";

export function error(c: Context, status: 400 | 401 | 402 | 403 | 404 | 409 | 413 | 429 | 503, code: string, message: string) {
  return c.json({ error: code, message }, status);
}

export async function jsonBody(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await c.req.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
