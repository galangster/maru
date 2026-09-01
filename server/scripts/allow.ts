import { resolve } from "node:path";
import { migrate, createPostgresDb } from "../src/db.js";
import { normalizeEmail } from "../src/util.js";

const [command, rawEmail] = process.argv.slice(2);
const emailCommands = new Set(["add", "remove", "comp", "uncomp"]);
const valid = command === "list" || (command === "enforce" && (rawEmail === "on" || rawEmail === "off")) ||
  (command !== undefined && emailCommands.has(command) && rawEmail !== undefined);
if (!valid) {
  console.error("Usage: allow.ts add|remove|comp|uncomp <email> | list | enforce on|off");
  process.exitCode = 2;
} else {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const db = createPostgresDb(databaseUrl);
  try {
    await migrate(db, resolve(import.meta.dirname, "../migrations"));
    if (command === "list") {
      const rows = await db.query<{ email: string }>("SELECT email FROM allowed_emails ORDER BY email");
      console.log(JSON.stringify(rows.map((row) => row.email)));
    } else if (command === "enforce") {
      await db.query("UPDATE config SET value = $1 WHERE key = 'allowlist_enforced'", [rawEmail === "on" ? "true" : "false"]);
      console.log(JSON.stringify({ ok: true, command, enforced: rawEmail === "on" }));
    } else {
      const email = normalizeEmail(rawEmail!);
      if (!email) throw new Error("Email is required");
      if (command === "add") {
        await db.query("INSERT INTO allowed_emails (email) VALUES ($1) ON CONFLICT (email) DO NOTHING", [email]);
      } else if (command === "remove") {
        await db.query("DELETE FROM allowed_emails WHERE email = $1", [email]);
      } else {
        const rows = await db.query<{ id: string }>(
          "UPDATE users SET comped = $2 WHERE email = $1 AND deleted_at IS NULL RETURNING id",
          [email, command === "comp"],
        );
        if (rows.length === 0) throw new Error("Account not found");
      }
      console.log(JSON.stringify({ ok: true, command }));
    }
  } finally {
    await db.close();
  }
}
