import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "../src/db.js";

type Connection = Pick<PGlite, "query" | "exec">;

export function createPgliteDb(client: PGlite): Db {
  let savepointId = 0;
  const adapter = (connection: Connection, root: PGlite | null): Db => ({
    async query<T extends Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const result = await connection.query<T>(text, [...params]);
      return result.rows;
    },
    async exec(text: string) {
      await connection.exec(text);
    },
    async transaction<T>(work: (db: Db) => Promise<T>) {
      if (root) return root.transaction(async (transaction) => work(adapter(transaction, null)));
      const savepoint = `maru_savepoint_${savepointId += 1}`;
      await connection.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = await work(adapter(connection, null));
        await connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
        return result;
      } catch (cause) {
        await connection.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        await connection.exec(`RELEASE SAVEPOINT ${savepoint}`);
        throw cause;
      }
    },
    async close() {
      if (root) await root.close();
    },
  });
  return adapter(client, client);
}
