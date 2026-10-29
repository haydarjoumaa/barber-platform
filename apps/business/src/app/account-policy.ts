/** Pure request policy, shared by server actions and their security tests. */
export function staffAccountConfig(value: string | undefined) {
  if (!value) throw new Error("APP_ORIGIN is required");
  const origin = new URL(value);
  if (origin.origin !== value || !["http:", "https:"].includes(origin.protocol) ||
    (origin.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))) throw new Error("Invalid APP_ORIGIN");
  const secure = origin.protocol === "https:";
  return { origin: origin.origin, secure, cookieName: secure ? "__Host-barber-staff" : "barber-staff-local" };
}

export function assertAccountOrigin(actual: string | null, expected: string) {
  if (actual !== expected) throw new Error("Invalid request origin");
}
