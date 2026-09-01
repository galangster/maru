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

export function hashProof(value: string) {
  return hash(Buffer.from(value, "base64url"), { ...options, salt: randomBytes(16) });
}

export function verifyProof(encodedHash: string, value: string) {
  return verify(encodedHash, Buffer.from(value, "base64url"));
}
