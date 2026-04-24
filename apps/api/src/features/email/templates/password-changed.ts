import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

/**
 * Testi localizzati per la notifica di sicurezza "password modificata".
 *
 * ─── AGGIUNGERE UNA NUOVA LINGUA ─────────────────────────────────────────────
 * Vedi le istruzioni in `templates/password-reset.ts`.
 * ─────────────────────────────────────────────────────────────────────────────
 */
const COPY: Record<EmailLocale, {
  subject: string
  title: string
  body: string
  warning: string
  footer: string
}> = {
  en: {
    subject: 'Your Beech CMS password has been changed',
    title: 'Your password has been changed',
    body: 'Your Beech CMS account password was successfully changed. If you made this change, no action is needed.',
    warning:
      'If you did not make this change, your account may be compromised. Contact your administrator immediately.',
    footer: 'This is an automated security notification. Do not reply to this email.',
  },
  it: {
    subject: 'La tua password Beech CMS è stata modificata',
    title: 'La tua password è stata modificata',
    body: 'La password del tuo account Beech CMS è stata modificata con successo. Se hai effettuato tu questa modifica, non devi fare nulla.',
    warning:
      'Se non hai effettuato tu questa modifica, il tuo account potrebbe essere compromesso. Contatta immediatamente il tuo amministratore.',
    footer: 'Questa è una notifica di sicurezza automatica. Non rispondere a questa email.',
  },
}

/**
 * Costruisce l'email di notifica "password modificata".
 *
 * Questa email non ha un pulsante CTA — è una pura notifica di sicurezza.
 * Il blocco `warning` (testo rosso) avvisa l'utente di agire se non è
 * stato lui a modificare la password.
 *
 * @param locale - Lingua per oggetto e corpo dell'email.
 * @returns Oggetto con `subject` (stringa) e `html` (documento HTML completo).
 */
export function buildPasswordChangedEmail(
  locale: EmailLocale,
): { subject: string; html: string } {
  const c = COPY[locale]
  return {
    subject: c.subject,
    html: buildEmailShell(locale, {
      title: c.title,
      body: c.body,
      warning: c.warning,
      footer: c.footer,
    }),
  }
}
