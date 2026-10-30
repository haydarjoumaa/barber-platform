import { appointmentMessage, whatsappLink, messages, type AppointmentMessageInput, type Locale } from "@barber/shared";

export function AppointmentMessage({ appointment, phone, locale }: { appointment: AppointmentMessageInput; phone: string | null; locale: Locale }) {
  const t = messages[locale];
  if (!whatsappLink(phone, "")) return <p className="field-note">{t.whatsappNoPhone}</p>;
  return <details>
    <summary>{t.whatsappReview}</summary>
    <p className="field-note">{t.whatsappManualNote}</p>
    {([locale, locale === "en" ? "ar" : "en"] as const).map(language => {
      const text = appointmentMessage(appointment, language);
      return <section key={language} lang={language} dir={language === "ar" ? "rtl" : "ltr"}>
        <h5>{language === "en" ? "English" : "العربية"}</h5>
        <p style={{ whiteSpace: "pre-wrap" }}>{text}</p>
        <a className="secondary-button" href={whatsappLink(phone, text)!} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{messages[language].whatsappOpen}</a>
      </section>;
    })}
  </details>;
}
