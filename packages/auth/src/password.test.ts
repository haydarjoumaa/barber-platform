import { scryptSync } from "node:crypto";
import { beforeAll, expect, it } from "vitest";
import { hashPassword, verifyPassword, verifyAccountPassword } from "./password-core";
import { PasswordCapacityError, runPasswordWork } from "./password-work";

const password = "  كلمة مرور طويلة 🔐 e\u0301  ";
let encoded: string;
beforeAll(async () => { encoded = await hashPassword(password); });

it("verifies exact Unicode input without trimming or normalization", async () => {
  expect(await verifyPassword(password, encoded)).toBe(true);
  expect(await verifyPassword(password.trim(), encoded)).toBe(false);
  expect(await verifyPassword(password.normalize("NFC"), encoded)).toBe(false);
  expect(await verifyPassword("wrong password", encoded)).toBe(false);
});

it("uses a fresh salt and interoperates with Node's scrypt", async () => {
  const second = await hashPassword(password);
  expect(second).not.toBe(encoded);
  const parts = second.split("$");
  const key = scryptSync(password, Buffer.from(parts[4]!, "hex"), 32,
    { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 });
  expect(parts[5]).toBe(key.toString("hex"));
  expect(second).not.toContain(password);
});

it("rejects corrupted hashes, unsupported parameters and noncanonical encodings", async () => {
  for (const invalid of ["", "plaintext", encoded + "x", encoded.slice(0, -1),
    encoded.replace("v1", "v2"), encoded.replace("131072", "1048576"),
    encoded.replace("131072", "16384"), encoded.toUpperCase(),
    encoded.slice(0, -1) + "g", "x".repeat(10000)]) {
    expect(await verifyPassword(password, invalid)).toBe(false);
  }
  const tampered = encoded.slice(0, -1) + (encoded.endsWith("0") ? "1" : "0");
  expect(await verifyPassword(password, tampered)).toBe(false);
});

it.each(["", "x".repeat(1025), "🔐".repeat(257), "\ud800", "\udfff"])(
  "rejects invalid password input %# without hashing", async value => {
    await expect(hashPassword(value)).rejects.toThrow("Invalid password input");
    expect(await verifyPassword(value, encoded)).toBe(false);
  });

it("accepts the full UTF-8 byte limit without truncation", async () => {
  const long = "🔐".repeat(256);
  const hash = await hashPassword(long);
  expect(await verifyPassword(long, hash)).toBe(true);
  expect(await verifyPassword(long.slice(0, -2), hash)).toBe(false);
});

it("authenticates only an existing account with the exact password", async () => {
  expect(await verifyAccountPassword(password, encoded)).toBe(true);
  expect(await verifyAccountPassword("incorrect", encoded)).toBe(false);
  expect(await verifyAccountPassword(password, null)).toBe(false);
  expect(await verifyAccountPassword(password, "corrupt record")).toBe(false);
});

it("uses the shared work budget even for missing and malformed account hashes", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const blockers = [runPasswordWork(() => pending), runPasswordWork(() => pending)];
  try {
    await expect(hashPassword(password)).rejects.toBeInstanceOf(PasswordCapacityError);
    await expect(verifyPassword(password, encoded)).rejects.toBeInstanceOf(PasswordCapacityError);
    for (const record of [encoded, null, "corrupt record"]) {
      await expect(verifyAccountPassword(password, record)).rejects.toBeInstanceOf(PasswordCapacityError);
    }
    expect(await verifyAccountPassword("", null)).toBe(false);
  } finally {
    release();
    await Promise.all(blockers);
  }
  expect(await verifyAccountPassword(password, encoded)).toBe(true);
});
