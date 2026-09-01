import { randomBytes } from "node:crypto";
import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { SERVER_HASH_KDF } from "./constants.js";

const options = {
  algorithm: 2 as Algorithm,
  memoryCost: SERVER_HASH_KDF.m,
  timeCost: SERVER_HASH_KDF.t,
  parallelism: SERVER_HASH_KDF.p,
  outputLen: 32,
};

// The proof is hashed as its base64url TEXT, not its raw bytes. The binding
// treats a Buffer password as UTF-8, and a random 32-byte proof is not valid
// UTF-8 more often than not, so verify() threw "invalid utf-8 sequence" on
// the live service while hash() had happily accepted the same bytes.
export function hashProof(value: string) {
  return hash(value, { ...options, salt: randomBytes(16) });
}

export function verifyProof(encodedHash: string, value: string) {
  return verify(encodedHash, value);
}
