import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { runPasswordWork } from "./password-work";

// Versioned, fixed parameters: stored data cannot request arbitrary CPU/memory.
const PREFIX = "barber-scrypt-v1$131072$8$1$";
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MAX_PASSWORD_BYTES = 1024;
const ENCODED_LENGTH = PREFIX.length + SALT_BYTES * 2 + 1 + KEY_BYTES * 2;

function validPassword(password: unknown): password is string {
  // Reject lone surrogates: UTF-8 replacement would make distinct inputs equivalent.
  return typeof password === "string" && password.length > 0 &&
    password.length <= MAX_PASSWORD_BYTES && Buffer.from(password, "utf8").toString("utf8") === password &&
    Buffer.byteLength(password, "utf8") <= MAX_PASSWORD_BYTES;
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return runPasswordWork(() => new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  }));
}

function parseHash(encoded: unknown): { salt: Buffer; key: Buffer } | null {
  if (typeof encoded !== "string" || encoded.length !== ENCODED_LENGTH || !encoded.startsWith(PREFIX)) return null;
  const payload = encoded.slice(PREFIX.length);
  if (!/^[a-f0-9]{32}\$[a-f0-9]{64}$/.test(payload)) return null;
  return { salt: Buffer.from(payload.slice(0, 32), "hex"), key: Buffer.from(payload.slice(33), "hex") };
}

/** Internal primitive. Application code imports the server-only @barber/auth/password entry. */
export async function hashPassword(password: string): Promise<string> {
  if (!validPassword(password)) throw new Error("Invalid password input");
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString("hex")}$${key.toString("hex")}`;
}

/** Invalid stored hashes fail closed; operational crypto errors propagate. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (!validPassword(password)) return false;
  const record = parseHash(encoded);
  if (!record) return false;
  const actual = await derive(password, record.salt);
  return timingSafeEqual(actual, record.key);
}

// Public, non-credential dummy values; the result can never authenticate an account.
const DUMMY_SALT = Buffer.alloc(SALT_BYTES);
const DUMMY_KEY = Buffer.alloc(KEY_BYTES);

/**
 * Login-oriented check: pass null after an authorized tenant lookup finds no account.
 * Missing/unsupported records receive the same KDF cost as a valid stored record.
 * This does not equalize database timing or replace endpoint rate limiting.
 */
export async function verifyAccountPassword(password: string, encoded: string | null): Promise<boolean> {
  if (!validPassword(password)) return false;
  const record = parseHash(encoded);
  const actual = await derive(password, record?.salt ?? DUMMY_SALT);
  const matches = timingSafeEqual(actual, record?.key ?? DUMMY_KEY);
  return record !== null && matches;
}
