const MAX_MINOR = 2_147_483_647;

/** Format integer receipts and aggregates without floating-point rounding. */
export function formatMoneyMinor(amount: bigint | string, currency: string, locale: string): string {
  const minor = BigInt(amount);
  if (minor < 0n) throw new Error("Invalid amount");
  const precision = currencyPrecision(currency);
  const scale = 10n ** BigInt(precision);
  const fraction = precision ? new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: precision, maximumFractionDigits: 0 }).format(minor % scale) : "";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).formatToParts(minor / scale)
    .map(part => part.type === "fraction" ? fraction : part.value).join("");
}

export function currencyPrecision(currency: string): number {
  if (!Intl.supportedValuesOf("currency").includes(currency)) throw new Error("Unsupported currency");
  return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits!;
}

/** Exact decimal conversion: never round an owner's entered price. */
export function parsePriceMinor(input: string, currency: string): number {
  const precision = currencyPrecision(currency);
  const normalized = input.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0)).replace("٫", ".");
  if (normalized.length > 32 || !/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("Invalid price");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > precision) throw new Error("Invalid price precision");
  const minor = BigInt(whole!) * 10n ** BigInt(precision) + BigInt(fraction.padEnd(precision, "0") || "0");
  if (minor > BigInt(MAX_MINOR)) throw new Error("Price too large");
  return Number(minor);
}

export function priceInputValue(minor: number, currency: string): string {
  if (!Number.isInteger(minor) || minor < 0 || minor > MAX_MINOR) throw new Error("Invalid price");
  const precision = currencyPrecision(currency);
  const digits = String(minor).padStart(precision + 1, "0");
  return precision ? `${digits.slice(0, -precision)}.${digits.slice(-precision)}` : digits;
}
