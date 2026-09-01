import type { Db } from "./db.js";
import { normalizeEmail } from "./util.js";

function emailsFrom(source: string | undefined) {
  return [...new Set((source ?? "").split(",").map(normalizeEmail).filter(Boolean))];
}

export async function seedAllowlist(db: Db, source: string | undefined) {
  const emails = emailsFrom(source);
  for (const email of emails) {
    await db.query(
      "INSERT INTO allowed_emails (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
      [email],
    );
  }
  return emails.length;
}

export async function seedComped(db: Db, source: string | undefined) {
  const emails = emailsFrom(source);
  let updated = 0;
  for (const email of emails) {
    const rows = await db.query<{ id: string }>(
      "UPDATE users SET comped = true WHERE email = $1 AND deleted_at IS NULL AND comped = false RETURNING id",
      [email],
    );
    updated += rows.length;
  }
  return updated;
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
