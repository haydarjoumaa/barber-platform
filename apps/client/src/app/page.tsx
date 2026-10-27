"use client";

import { LanguageSwitcher, useLocale } from "@barber/ui";

export default function Home() {
  const { t, locale } = useLocale();
  return <div className="client-shell">
    <a className="skip-link" href="#main-content">{t("skip")}</a>
    <header className="client-header"><div className="brand"><span className="brand-mark" aria-hidden="true">B/</span><span>{t("brand")}</span></div><LanguageSwitcher /></header>
    <main id="main-content" tabIndex={-1}>
      <section className="client-hero"><div><p className="eyebrow">{t("client")}</p><h1>{t("clientTitle")}</h1><p className="hero-description">{t("clientNote")}</p><div className="link-callout"><h2>{t("linkTitle")}</h2><p>{t("linkNote")}</p></div></div><div className="hero-art" aria-hidden="true"><span className="art-ring ring-one" /><span className="art-ring ring-two" /><span className="art-monogram">B/</span><span className="art-caption">BARBER / PLATFORM</span></div></section>
      <div className="preview-notice"><strong>{t("preview")}</strong><p>{t("clientPreview")}</p></div>
      <section className="booking-explainer" aria-labelledby="how-title"><h2 className="eyebrow" id="how-title">{t("how")}</h2><div className="setup-grid">{([ ["choose", "chooseNote"], ["time", "timeNote"], ["visit", "visitNote"] ] as const).map(([title, note], index) => <article className="booking-step" key={title}><span className="step-number">{new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(index + 1)}</span><h2>{t(title)}</h2><p>{t(note)}</p></article>)}</div></section>
      <section className="faq" aria-labelledby="faq-title"><h2 id="faq-title">{t("questions")}</h2><div>{([ ["accountQuestion", "accountAnswer"], ["paymentQuestion", "paymentAnswer"], ["passwordQuestion", "passwordAnswer"] ] as const).map(([question, answer]) => <details key={question}><summary>{t(question)}</summary><p>{t(answer)}</p></details>)}</div></section>
    </main><footer className="client-footer">{t("footer")}</footer>
  </div>;
}
