import type { Kdf } from "./types.js";

export const DEFAULT_KDF: Kdf = { algo: "argon2id", m: 65_536, t: 3, p: 4 };
export const MAX_VAULT_BYTES = 384 * 1024;
export const SESSION_IDLE_DAYS = 365;
export const TRIAL_DAYS = 14;
export const BILLING_GRACE_DAYS = 7;
