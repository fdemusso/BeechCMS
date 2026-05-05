import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

/**
 * Localized texts for the "password changed" security notification.
 *
 * ─── ADDING A NEW LANGUAGE ──────────────────────────────────────────────────
 * See instructions in `templates/password-reset.ts`.
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
 * Builds the "password changed" notification email.
 *
 * This email does not have a CTA button — it is a pure security notification.
 * The `warning` block (red text) warns the user to take action if they
 * were not the one who changed the password.
 *
 * @param locale - Language for the email subject and body.
 * @returns Object with `subject` (string) and `html` (complete HTML document).
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
