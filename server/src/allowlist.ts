import type { Db } from "./db.js";
import { normalizeEmail } from "./util.js";

export async function seedAllowlist(db: Db, source: string | undefined) {
  const emails = [...new Set((source ?? "").split(",").map(normalizeEmail).filter(Boolean))];
  for (const email of emails) {
    await db.query(
      "INSERT INTO allowed_emails (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
      [email],
    );
  }
  return emails.length;
}

export async function allowlistStatus(db: Db, email: string) {
  const [config] = await db.query<{ value: string }>(
    "SELECT value FROM config WHERE key = 'allowlist_enforced'",
  );
  const [allowed] = await db.query<{ email: string }>(
    "SELECT email FROM allowed_emails WHERE email = $1",
    [normalizeEmail(email)],
  );
  return { enforced: config?.value !== "false", allowed: allowed !== undefined };
}
