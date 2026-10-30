interface SearchableAppointment {
  status: string;
  client: { name: string; phone: string } | null;
  guestName: string | null;
  guestPhone: string | null;
  barber: { displayName: string };
}

const statuses = new Set(["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]);

/** Presentation filter over records already authorized and scoped by the repository. */
export function filterAppointments<T extends SearchableAppointment>(appointments: readonly T[], search = "", status = ""): T[] {
  const query = search.slice(0, 100).trim().toLocaleLowerCase();
  return appointments.filter(appointment =>
    (!statuses.has(status) || appointment.status === status) &&
    (!query || [appointment.client?.name, appointment.client?.phone, appointment.guestName,
      appointment.guestPhone, appointment.barber.displayName].some(value => value?.toLocaleLowerCase().includes(query))));
}

export function calendarFilterLink(date: string, view: string, shopId: string, search = "", status = ""): string {
  const params = new URLSearchParams({ date, view });
  if (search.trim()) params.set("search", search.slice(0, 100));
  if (statuses.has(status)) params.set("status", status);
  return `?${params}#appointments-${encodeURIComponent(shopId)}`;
}
