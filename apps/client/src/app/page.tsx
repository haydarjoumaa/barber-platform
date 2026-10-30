"use client";

import { Icon, LanguageSwitcher, useLocale } from "@barber/ui";

export default function Home() {
  const { t, locale } = useLocale();
  const steps = [["choose", "chooseNote", "services"], ["time", "timeNote", "clock"], ["visit", "visitNote", "shop"]] as const;
  return <div className="client-shell">
    <a className="skip-link" href="#main-content">{t("skip")}</a>
    <header className="client-header"><div className="brand"><span className="brand-mark"><Icon name="services" /></span><span>{t("brand")}</span></div><LanguageSwitcher /></header>
    <main id="main-content" tabIndex={-1}>
      <section className="client-hero"><div className="hero-copy"><p className="hero-label"><span className="status-dot" />{t("client")}</p><h1>{t("clientTitle")}</h1><p className="hero-description">{t("clientNote")}</p><a className="primary-button" href="#how-title">{t("howLink")}<Icon name="arrow" className="directional" /></a><div className="hero-reassurance"><span><Icon name="shield" />{t("oneShop")}</span><span><Icon name="shop" />{t("payAtShop")}</span></div></div><div className="booking-visual"><div className="booking-visual-heading"><span className="visual-scissors"><Icon name="services" /></span><p>{t("clientPromise")}</p><span>{t("clientPromiseNote")}</span></div><div className="visual-steps">{steps.map(([title,, icon], index) => <div key={title}><span className="visual-step-icon"><Icon name={icon} /></span><strong>{t(title)}</strong><span className="visual-number">{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(index + 1)}</span></div>)}</div><p className="visual-footnote"><Icon name="clock" />{t("how")}</p></div></section>
      <section className="link-callout"><span className="callout-icon"><Icon name="link" /></span><div><h2>{t("linkTitle")}</h2><p>{t("linkNote")}</p></div></section>
      <section className="booking-explainer" aria-labelledby="how-title"><div className="section-heading"><p className="eyebrow">{t("client")}</p><h2 id="how-title">{t("how")}</h2></div><div className="booking-steps">{steps.map(([title, note, icon], index) => <article className="booking-step" key={title}><div className="step-top"><span className="setup-icon"><Icon name={icon} /></span><span className="step-number">{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(index + 1)}</span></div><h3>{t(title)}</h3><p>{t(note)}</p></article>)}</div></section>
      <section className="faq" aria-labelledby="faq-title"><div><p className="eyebrow">{t("oneShop")}</p><h2 id="faq-title">{t("questions")}</h2></div><div>{([["accountQuestion", "accountAnswer"], ["paymentQuestion", "paymentAnswer"], ["passwordQuestion", "passwordAnswer"]] as const).map(([question, answer]) => <details key={question}><summary>{t(question)}<Icon name="plus" /></summary><p>{t(answer)}</p></details>)}</div></section>
    </main><footer className="client-footer"><span>{t("brand")}</span><span>{t("footer")}</span></footer>
  </div>;
}
