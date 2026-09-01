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

/** Returns how many addresses were newly added to the standing list. */
export async function seedComped(db: Db, source: string | undefined) {
  let added = 0;
  for (const email of emailsFrom(source)) added += await comp(db, email, true);
  return added;
}

/** Comp (or uncomp) an address: the standing list, plus any live account. Returns 1 when the list changed. */
export async function comp(db: Db, email: string, comped: boolean) {
  const changed = comped
    ? await db.query<{ email: string }>(
      "INSERT INTO comped_emails (email) VALUES ($1) ON CONFLICT (email) DO NOTHING RETURNING email", [email])
    : await db.query<{ email: string }>("DELETE FROM comped_emails WHERE email = $1 RETURNING email", [email]);
  await db.query("UPDATE users SET comped = $2 WHERE email = $1 AND deleted_at IS NULL", [email, comped]);
  return changed.length;
}

export async function isComped(db: Db, email: string) {
  const [row] = await db.query<{ email: string }>("SELECT email FROM comped_emails WHERE email = $1", [email]);
  return row !== undefined;
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
