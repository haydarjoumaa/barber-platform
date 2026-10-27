"use client";

import { useState } from "react";
import { LanguageSwitcher, useLocale } from "@barber/ui";
import type { MessageKey } from "@barber/shared";

const sections = ["overview", "appointments", "services", "team", "shop"] as const;
type Section = typeof sections[number];
const panels: Record<Exclude<Section, "overview">, { title: MessageKey; note: MessageKey; action: MessageKey; symbol: string }> = {
  appointments: { title: "scheduleTitle", note: "scheduleNote", action: "newAppointment", symbol: "◷" },
  services: { title: "serviceEmpty", note: "serviceEmptyNote", action: "addService", symbol: "≡" },
  team: { title: "teamEmpty", note: "teamEmptyNote", action: "addBarber", symbol: "♧" },
  shop: { title: "shopEmpty", note: "shopEmptyNote", action: "editProfile", symbol: "⌂" },
};
const setup: { section: Section; title: MessageKey; note: MessageKey }[] = [
  { section: "shop", title: "profileTitle", note: "profileNote" },
  { section: "services", title: "servicesTitle", note: "servicesNote" },
  { section: "team", title: "teamTitle", note: "teamNote" },
];

export default function Home() {
  const { t, locale } = useLocale();
  const [section, setSection] = useState<Section>("overview");
  const panel = section === "overview" ? null : panels[section];
  return <div className="business-shell">
    <a className="skip-link" href="#main-content">{t("skip")}</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark" aria-hidden="true">B/</span><span>{t("brand")}<small>{t("business")}</small></span></div>
      <p className="eyebrow sidebar-label">{t("workspace")}</p>
      <nav aria-label={t("workspace")} className="workspace-nav">{sections.map((item, index) => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}><span aria-hidden="true">{["◫", "◷", "≡", "♧", "⌂"][index]}</span>{t(item)}</button>)}</nav>
      <div className="sidebar-note"><span className="status-dot" />{t("preview")}</div>
    </aside>
    <div className="workspace-body">
      <header className="workspace-header"><span>{t(section)}</span><LanguageSwitcher /></header>
      <main id="main-content" tabIndex={-1} className="workspace-main">
        <div className="preview-notice"><strong>{t("preview")}</strong><p>{t("previewNote")}</p></div>
        <div className="page-heading"><p className="eyebrow">{t("business")}</p><h1>{section === "overview" ? t("welcome") : t(section)}</h1><p>{section === "overview" ? t("welcomeNote") : t("notConnected")}</p></div>
        {panel ? <section className="empty-panel" aria-labelledby="panel-title"><span className="empty-symbol" aria-hidden="true">{panel.symbol}</span><h2 id="panel-title">{t(panel.title)}</h2><p>{t(panel.note)}</p><button className="primary-button" type="button" disabled aria-describedby="unavailable-note">{t(panel.action)}</button><small id="unavailable-note">{t("coming")}</small></section> : <>
          <section aria-labelledby="setup-title"><div className="section-heading"><h2 id="setup-title">{t("setupTitle")}</h2><p>{t("setupNote")}</p></div><div className="setup-grid">{setup.map((item, index) => <article className="setup-card" key={item.section}><span className="step-number">{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(index + 1)}</span><h3>{t(item.title)}</h3><p>{t(item.note)}</p><button className="text-button" type="button" onClick={() => setSection(item.section)}>{t("viewSection")}<span aria-hidden="true">{locale === "ar" ? "←" : "→"}</span><span className="sr-only">: {t(item.title)}</span></button></article>)}</div></section>
          <section className="quiet-card"><div><h2>{t("scheduleTitle")}</h2><p>{t("scheduleNote")}</p></div><button className="secondary-button" type="button" onClick={() => setSection("appointments")}>{t("appointments")}</button></section>
        </>}
      </main><footer className="workspace-footer">{t("footer")}</footer>
    </div>
  </div>;
}
