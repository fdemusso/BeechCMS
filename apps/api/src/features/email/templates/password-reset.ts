import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

/**
 * Testi localizzati per l'email di reset password.
 *
 * ─── AGGIUNGERE UNA NUOVA LINGUA ─────────────────────────────────────────────
 * 1. Aggiungi il codice ISO in `SUPPORTED_EMAIL_LOCALES` (email.types.ts).
 * 2. Aggiungi una chiave corrispondente in questo oggetto con tutti i campi.
 *    TypeScript segnala immediatamente le chiavi mancanti grazie a
 *    `Record<EmailLocale, …>`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const COPY: Record<EmailLocale, {
  subject: string
  title: string
  body: string
  ctaLabel: string
  footer: string
}> = {
  en: {
    subject: 'Reset your Beech CMS password',
    title: 'Reset your password',
    body: 'You requested a password reset for your Beech CMS account. Click the button below to set a new password. This link expires in 30 minutes.',
    ctaLabel: 'Reset password',
    footer: "If you didn't request this, you can safely ignore this email.",
  },
  it: {
    subject: 'Reimposta la tua password Beech CMS',
    title: 'Reimposta la tua password',
    body: 'Hai richiesto il reset della password per il tuo account Beech CMS. Clicca il pulsante qui sotto per impostare una nuova password. Questo link scade tra 30 minuti.',
    ctaLabel: 'Reimposta password',
    footer: 'Se non hai richiesto questo, puoi ignorare questa email in tutta sicurezza.',
  },
}

/**
 * Costruisce l'email con il link di reset password.
 *
 * Compone il contenuto localizzato con il layout base (`buildEmailShell`)
 * iniettando il pulsante CTA che punta all'URL di reset.
 *
 * @param resetUrl - URL completo con il token in chiaro, es.
 *                   `https://dashboard.beechcms.dev/reset-password?token=<uuid>`.
 *                   Viene incorporato direttamente nel pulsante CTA — non sanificare
 *                   ulteriormente: il token è un UUID generato internamente.
 * @param locale   - Lingua per oggetto e corpo dell'email.
 * @returns Oggetto con `subject` (stringa) e `html` (documento HTML completo).
 */
export function buildPasswordResetEmail(
  resetUrl: string,
  locale: EmailLocale,
): { subject: string; html: string } {
  const c = COPY[locale]
  return {
    subject: c.subject,
    html: buildEmailShell(locale, {
      title: c.title,
      body: c.body,
      cta: { label: c.ctaLabel, href: resetUrl },
      footer: c.footer,
    }),
  }
}
