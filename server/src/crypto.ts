import { randomBytes } from "node:crypto";
import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { DEFAULT_KDF } from "./constants.js";

const options = {
  algorithm: 2 as Algorithm,
  memoryCost: DEFAULT_KDF.m,
  timeCost: DEFAULT_KDF.t,
  parallelism: DEFAULT_KDF.p,
  outputLen: 32,
};

export function hashProof(value: string) {
  return hash(Buffer.from(value, "base64url"), { ...options, salt: randomBytes(16) });
}

export function verifyProof(encodedHash: string, value: string) {
  return verify(encodedHash, Buffer.from(value, "base64url"));
}
