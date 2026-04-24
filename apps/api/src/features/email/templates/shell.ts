import type { EmailLocale } from '../email.types'

/**
 * Slot di contenuto che ogni template deve fornire per comporre un'email completa.
 * Ogni slot corrisponde a un blocco visivo nel layout della card email.
 */
export interface EmailShellSlots {
  /**
   * Heading H2 mostrato in cima alla card. Mantienilo sotto ~50 caratteri
   * per garantire una buona leggibilità su client mobile.
   */
  title: string

  /**
   * Testo principale del corpo. Renderizzato come paragrafo.
   * È ammesso HTML inline sicuro (es. `<strong>`, `<a href="...">`),
   * ma evita elementi block (`<p>`, `<div>`) che potrebbero rompere
   * la struttura del layout in client email rigidi (Outlook, Gmail).
   */
  body: string

  /**
   * Pulsante call-to-action opzionale, renderizzato come link-button scuro.
   * Ometti per email di sola notifica che non richiedono azione da parte dell'utente.
   */
  cta?: { label: string; href: string }

  /**
   * Paragrafo di avviso opzionale. Renderizzato in rosso (#ef4444) per attirare
   * l'attenzione. Usalo per avvisi di sicurezza
   * ("se non sei stato tu, agisci immediatamente").
   */
  warning?: string

  /**
   * Testo piccolo grigio in fondo alla card.
   * Usato per note del tipo "notifica automatica, non rispondere".
   */
  footer: string
}

/**
 * Costruisce il layout HTML base condiviso da tutte le email transazionali
 * di Beech CMS.
 *
 * ─── FONTE UNICA DI VERITÀ PER IL BRANDING ───────────────────────────────────
 * Modificare questa funzione cambia l'aspetto visivo di TUTTE le email
 * in uscita contemporaneamente:
 *   - colore di sfondo e della card
 *   - stile del bordo e del border-radius
 *   - scala tipografica e spaziatura
 *   - stile del pulsante CTA
 *
 * Per cambiare il testo o la struttura di una email specifica, modifica invece
 * il file template corrispondente (`templates/password-reset.ts`, ecc.).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param locale - Usato per l'attributo `lang` del tag `<html>`.
 * @param slots  - Blocchi di contenuto iniettati nel layout.
 * @returns Un documento HTML completo e self-contained pronto per l'invio.
 */
export function buildEmailShell(locale: EmailLocale, slots: EmailShellSlots): string {
  const ctaBlock = slots.cta
    ? `<a href="${slots.cta.href}"
          style="display:inline-block;background:#111;color:#fff;padding:12px 24px;
                 border-radius:6px;text-decoration:none;font-size:15px;font-weight:500;
                 margin-bottom:24px">
         ${slots.cta.label}
       </a>`
    : ''

  const warningBlock = slots.warning
    ? `<p style="margin:0 0 24px;color:#ef4444;font-size:15px;line-height:1.5;font-weight:500">
         ${slots.warning}
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="font-family:sans-serif;background:#f9f9f9;margin:0;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;
              padding:32px;border:1px solid #e5e5e5">
    <h2 style="margin:0 0 16px;font-size:20px;color:#111">${slots.title}</h2>
    <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.5">${slots.body}</p>
    ${ctaBlock}${warningBlock}<p style="margin:0;color:#999;font-size:13px">${slots.footer}</p>
  </div>
</body>
</html>`
}
