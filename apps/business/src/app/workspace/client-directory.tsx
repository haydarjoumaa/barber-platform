"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@barber/ui";

export function ClientDirectory({ shopId, clients }: { shopId: string; clients: { id: string; name: string; phone: string }[] }) {
  const { t } = useLocale();
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const matches = clients.filter(client => client.name.toLocaleLowerCase().includes(query) || client.phone.includes(query));
  return <section className="team-management">
    <h3>{t("clientDirectory")}</h3>
    <label className="account-form">{t("bookingFindClient")}<input type="search" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label>
    {matches.length ? <ul className="managed-services">{matches.map(client => <li key={client.id}>
      <Link href={`/workspace/clients/${client.id}?shopId=${shopId}`}>{client.name} · <bdi>{client.phone}</bdi></Link>
    </li>)}</ul> : <p>{t("bookingNoClientMatch")}</p>}
  </section>;
}
