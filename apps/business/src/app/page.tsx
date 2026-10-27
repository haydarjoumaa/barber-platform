"use client";

import { useState } from "react";
import { Icon, LanguageSwitcher, useLocale } from "@barber/ui";
import type { MessageKey } from "@barber/shared";
import { AppointmentCalendar } from "./calendar";

const sections = ["overview", "appointments", "services", "team", "shop"] as const;
type Section = typeof sections[number];
const panels: Record<"services" | "team" | "shop", { title: MessageKey; note: MessageKey; action: MessageKey }> = {
  services: { title: "serviceEmpty", note: "serviceEmptyNote", action: "addService" },
  team: { title: "teamEmpty", note: "teamEmptyNote", action: "addBarber" },
  shop: { title: "shopEmpty", note: "shopEmptyNote", action: "editProfile" },
};
const setup: { section: "shop" | "services" | "team"; title: MessageKey; note: MessageKey }[] = [
  { section: "shop", title: "profileTitle", note: "profileNote" },
  { section: "services", title: "servicesTitle", note: "servicesNote" },
  { section: "team", title: "teamTitle", note: "teamNote" },
];

export default function Home() {
  const { t } = useLocale();
  const [section, setSection] = useState<Section>("overview");
  const panel = section === "overview" || section === "appointments" ? null : panels[section];
  return <div className="business-shell">
    <a className="skip-link" href="#main-content">{t("skip")}</a>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Icon name="services" /></span><span>{t("brand")}<small>{t("business")}</small></span></div>
      <p className="eyebrow sidebar-label">{t("workspace")}</p>
      <nav aria-label={t("workspace")} className="workspace-nav">{sections.map(item => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}><Icon name={item} />{t(item)}<span className="nav-indicator" /></button>)}</nav>
      <div className="sidebar-bottom"><Icon name="shield" /><p>{t("oneShop")}<small>{t("privateNote")}</small></p></div>
    </aside>
    <div className="workspace-body">
      <header className="workspace-header"><div className="breadcrumbs"><span>{t("workspace")}</span><span aria-hidden="true">/</span><strong>{t(section)}</strong></div><LanguageSwitcher /></header>
      <main id="main-content" tabIndex={-1} className="workspace-main">
        <div className="page-heading"><div><p className="eyebrow">{t("business")}</p><h1>{section === "overview" ? t("welcome") : t(section)}</h1><p>{section === "overview" ? t("welcomeNote") : section === "appointments" ? t("scheduleTitle") : t(panel!.note)}</p></div>{section === "overview" ? <button className="primary-button" onClick={() => setSection("shop")}><Icon name="plus" />{t("startSetup")}</button> : section === "appointments" ? <button className="primary-button" disabled aria-describedby="preview-note"><Icon name="plus" />{t("newAppointment")}</button> : null}</div>
        <div className="preview-notice" id="preview-note"><span className="status-dot" /><p><strong>{t("preview")}</strong><span>{t("previewNote")}</span></p></div>
        {section === "appointments" ? <AppointmentCalendar /> : panel ? <section className="empty-panel" aria-labelledby="panel-title"><span className="empty-symbol"><Icon name={section} /></span><h2 id="panel-title">{t(panel.title)}</h2><p>{t(panel.note)}</p><button className="primary-button" type="button" disabled aria-describedby="unavailable-note"><Icon name="plus" />{t(panel.action)}</button><small id="unavailable-note">{t("coming")}</small></section> : <>
          <div className="overview-grid">
            <section className="setup-panel" aria-labelledby="setup-title"><div className="panel-heading"><div><p className="eyebrow">{t("setupLabel")}</p><h2 id="setup-title">{t("setupTitle")}</h2></div><span className="neutral-badge">{t("setupProgress")}</span></div><p className="panel-description">{t("setupNote")}</p><div className="setup-list">{setup.map(item => <button className="setup-row" key={item.section} onClick={() => setSection(item.section)}><span className="setup-icon"><Icon name={item.section} /></span><span className="setup-copy"><strong>{t(item.title)}</strong><span>{t(item.note)}</span></span><Icon name="chevron" className="directional" /></button>)}</div></section>
            <section className="storefront-card"><div className="storefront-illustration" aria-hidden="true"><div className="storefront-window"><div className="window-dots"><i /><i /><i /></div><div className="mini-shop"><Icon name="shop" /></div><div className="skeleton-line" /><div className="skeleton-line short" /><div className="skeleton-button" /></div></div><div className="storefront-copy"><div className="card-title-row"><h2>{t("bookingPage")}</h2><span className="neutral-badge">{t("notPublished")}</span></div><p>{t("bookingPageNote")}</p><div className="link-placeholder"><Icon name="link" /><span>{t("bookingLinkPlaceholder")}</span></div><button className="text-button" onClick={() => setSection("shop")}>{t("editProfile")}<Icon name="arrow" className="directional" /></button></div></section>
          </div>
          <section className="schedule-summary"><div className="schedule-summary-heading"><div><h2>{t("scheduleTitle")}</h2><p>{t("scheduleNote")}</p></div><button className="secondary-button" onClick={() => setSection("appointments")}>{t("openCalendar")}<Icon name="arrow" className="directional" /></button></div><div className="schedule-placeholder"><span className="empty-symbol small"><Icon name="appointments" /></span><p>{t("noAppointmentsLoaded")}</p></div></section>
        </>}
      </main><footer className="workspace-footer">{t("footer")}</footer>
    </div>
  </div>;
}
