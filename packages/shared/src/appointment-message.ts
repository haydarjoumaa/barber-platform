import type { Locale } from "./index";
import { messages } from "./messages";
import { currencyPrecision } from "./money";

const statusKeys = { PENDING: "bookingStatusPending", CONFIRMED: "bookingStatusConfirmed", CANCELLED: "bookingStatusCancelled", COMPLETED: "bookingStatusCompleted", NO_SHOW: "bookingStatusNoShow" } as const;

export interface AppointmentMessageInput {
  shopName: string;
  clientName: string;
  barberName: string;
  startsAt: Date;
  timeZone: string;
  status: keyof typeof statusKeys;
  services: readonly { name: string; priceMinor: number; currency: string }[];
}

/** Only explicit international numbers are accepted; never guess a country code. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  if (!phone || !/^\+[1-9]\d{7,14}$/.test(phone)) return null;
  return `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(text)}`;
}

/** Build from saved appointment snapshots, never current catalog prices. */
export function appointmentMessage(input: AppointmentMessageInput, locale: Locale): string {
  const t = messages[locale];
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: input.timeZone, year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "shortOffset",
  }).format(input.startsAt);
  const lines = [t.whatsappHeading, input.shopName, input.clientName,
    `${t.bookingBarber}: ${input.barberName}`, `${date} (${input.timeZone})`,
    `${t.whatsappStatus}: ${t[statusKeys[input.status]]}`];
  const currency = input.services[0]?.currency;
  if (currency && input.services.every(service => service.currency === currency)) {
    const total = input.services.reduce((sum, service) => sum + service.priceMinor, 0);
    lines.push(input.services.map(service => service.name).join(" · "));
    lines.push(`${t.whatsappTotal}: ${new Intl.NumberFormat(locale, { style: "currency", currency }).format(total / 10 ** currencyPrecision(currency))}`);
  } else {
    lines.push(t.bookingHistoryMissing);
  }
  return lines.join("\n");
}
