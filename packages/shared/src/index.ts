export const DEFAULT_TIME_ZONE = "Asia/Beirut";
export const MAX_BOOKING_HORIZON_DAYS = 30;
export type StaffRole = "OWNER" | "BARBER" | "RECEPTIONIST";
export type Locale = "en" | "ar";
export const localeDirection = (locale: Locale) => locale === "ar" ? "rtl" : "ltr";

// Keep this list aligned with the gateway routing proposal before enabling storefronts.
export const RESERVED_SHOP_SLUGS = new Set([
  "business", "business-assets", "admin", "api", "auth", "login", "logout", "register", "setup",
  "account", "health", "assets", "static", "public", "support", "www",
]);
export function isValidShopSlug(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 63 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !RESERVED_SHOP_SLUGS.has(slug);
}

export function formatShopDateTime(instant: Date, locale: Locale = "en", timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(instant);
}

/** Response contract for liveness only; it does not claim database readiness. */
export interface HealthResponse { status: "ok"; app: "business"; }

export { messages, LOCALE_COOKIE, resolveLocale, type MessageKey } from "./messages";
export { findAvailableSlots, type TimeInterval, type BookingService, type BarberServiceOption, type AvailableBarber, type AvailabilityRequest, type AvailableSlot } from "./availability";
export { resolveLocalInstant, resolveLocalInterval, resolveClosureDate, resolveBarberSchedule, LocalTimeError, type LocalEndpoint, type LocalInterval, type DailyPeriod, type DaySchedule, type WeeklySchedule, type ScheduleOverride, type ScheduleRequest, type ResolvedSchedule } from "./scheduling";
