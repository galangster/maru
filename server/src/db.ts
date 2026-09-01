import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import postgres, { type Sql } from "postgres";

export interface Db {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(work: (db: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

function postgresAdapter(sql: Sql, canClose = true): Db {
  return {
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      return (await sql.unsafe(text, [...params] as never[])) as unknown as T[];
    },
    async exec(text: string) {
      await sql.unsafe(text).simple();
    },
    async transaction<T>(work: (db: Db) => Promise<T>) {
      return await sql.begin(async (transactionSql) => work(postgresAdapter(transactionSql as unknown as Sql, false))) as unknown as T;
    },
    async close() {
      if (canClose) await sql.end();
    },
  };
}

export function createPostgresDb(databaseUrl: string): Db {
  return postgresAdapter(postgres(databaseUrl, { max: 10 }));
}

export async function migrate(db: Db, migrationsDir = resolve(process.cwd(), "migrations")) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const names = (await readdir(migrationsDir))
    .filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name))
    .sort();
  const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((row) => row.name));

  for (const name of names) {
    if (applied.has(name)) continue;
    const sql = await readFile(resolve(migrationsDir, name), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    applied.add(name);
  }
}
