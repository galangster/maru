import type { Hono } from "hono";
import { requirePaidWrite } from "./access.js";
import { MAX_VAULT_BYTES } from "./constants.js";
import { error, jsonBody } from "./http.js";
import type { AppEnv } from "./session.js";
import type { AppDeps } from "./types.js";
import { asDate } from "./util.js";

interface VaultRow extends Record<string, unknown> {
  version: number;
  ciphertext: string;
  updated_at: Date | string;
}

function vaultResponse(vault: VaultRow) {
  return {
    version: vault.version,
    ciphertext: vault.ciphertext,
    updatedAt: asDate(vault.updated_at)?.toISOString(),
  };
}

async function retainTen(deps: AppDeps, userId: string) {
  await deps.db.query(
    `DELETE FROM vault_history
      WHERE user_id = $1
        AND version NOT IN (
          SELECT version FROM vault_history WHERE user_id = $1 ORDER BY version DESC LIMIT 10
        )`,
    [userId],
  );
}

export function registerVaultRoutes(app: Hono<AppEnv>, deps: AppDeps) {
  app.get("/v1/vault", async (c) => {
    const [vault] = await deps.db.query<VaultRow>(
      "SELECT version, ciphertext, updated_at FROM vaults WHERE user_id = $1",
      [c.get("session").user.id],
    );
    return vault ? c.json(vaultResponse(vault)) : c.body(null, 204);
  });

  app.put("/v1/vault", async (c) => {
    const denied = await requirePaidWrite(c, deps);
    if (denied) return denied;
    const body = await jsonBody(c);
    if (!Number.isSafeInteger(body?.baseVersion) || (body?.baseVersion as number) < 0 || typeof body?.ciphertext !== "string") {
      return error(c, 400, "invalid_request", "A base version and ciphertext are required.");
    }
    if (Buffer.byteLength(body.ciphertext, "utf8") > MAX_VAULT_BYTES) {
      return error(c, 413, "vault_too_large", "The vault ciphertext exceeds 384 KiB.");
    }
    const ciphertext = body.ciphertext;
    const userId = c.get("session").user.id;
    const result = await deps.db.transaction(async (tx) => {
      const [current] = await tx.query<VaultRow>(
        "SELECT version, ciphertext, updated_at FROM vaults WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      const currentVersion = current?.version ?? 0;
      if (body.baseVersion !== currentVersion) return { conflict: current ?? null } as const;
      const version = currentVersion + 1;
      const now = deps.clock.now();
      await tx.query(
        `INSERT INTO vaults (user_id, version, ciphertext, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET version = EXCLUDED.version,
           ciphertext = EXCLUDED.ciphertext, updated_at = EXCLUDED.updated_at`,
        [userId, version, ciphertext, now],
      );
      await tx.query(
        "INSERT INTO vault_history (user_id, version, ciphertext, updated_at) VALUES ($1, $2, $3, $4)",
        [userId, version, ciphertext, now],
      );
      return { version } as const;
    });
    if ("conflict" in result) {
      const current = result.conflict;
      return c.json({
        error: "conflict",
        message: "The vault has a newer version.",
        version: current?.version ?? 0,
        ciphertext: current?.ciphertext ?? null,
      }, 409);
    }
    await retainTen(deps, userId);
    return c.json({ version: result.version });
  });

  app.get("/v1/vault/history", async (c) => {
    const rows = await deps.db.query<Pick<VaultRow, "version" | "updated_at"> & Record<string, unknown>>(
      "SELECT version, updated_at FROM vault_history WHERE user_id = $1 ORDER BY version DESC",
      [c.get("session").user.id],
    );
    return c.json({
      versions: rows.map((row) => ({ version: row.version, updatedAt: asDate(row.updated_at)?.toISOString() })),
    });
  });

  app.post("/v1/vault/restore", async (c) => {
    const denied = await requirePaidWrite(c, deps);
    if (denied) return denied;
    const body = await jsonBody(c);
    const requestedVersion = body?.version;
    if (typeof requestedVersion !== "number" || !Number.isSafeInteger(requestedVersion) || requestedVersion < 1) {
      return error(c, 400, "invalid_request", "A vault version is required.");
    }
    const userId = c.get("session").user.id;
    const restored = await deps.db.transaction(async (tx) => {
      const [source] = await tx.query<VaultRow>(
        "SELECT version, ciphertext, updated_at FROM vault_history WHERE user_id = $1 AND version = $2",
        [userId, requestedVersion],
      );
      if (!source) return null;
      const [current] = await tx.query<VaultRow>(
        "SELECT version, ciphertext, updated_at FROM vaults WHERE user_id = $1 FOR UPDATE",
        [userId],
      );
      const version = (current?.version ?? 0) + 1;
      const now = deps.clock.now();
      await tx.query(
        `INSERT INTO vaults (user_id, version, ciphertext, updated_at) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO UPDATE SET version = EXCLUDED.version,
           ciphertext = EXCLUDED.ciphertext, updated_at = EXCLUDED.updated_at`,
        [userId, version, source.ciphertext, now],
      );
      await tx.query(
        "INSERT INTO vault_history (user_id, version, ciphertext, updated_at) VALUES ($1, $2, $3, $4)",
        [userId, version, source.ciphertext, now],
      );
      return version;
    });
    if (restored === null) return error(c, 404, "not_found", "That vault version does not exist.");
    await retainTen(deps, userId);
    return c.json({ version: restored });
  });
}
