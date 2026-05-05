import type { EmailLocale } from '../email.types'
import { buildEmailShell } from './shell'

/**
 * Localized texts for the password reset email.
 *
 * ─── ADDING A NEW LANGUAGE ──────────────────────────────────────────────────
 * 1. Add the ISO code in `SUPPORTED_EMAIL_LOCALES` (`email.types.ts`).
 * 2. Add a corresponding key in this object with all fields.
 *    TypeScript immediately reports missing keys thanks to
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
 * Builds the email with the password reset link.
 *
 * Composes the localized content with the base layout (`buildEmailShell`)
 * injecting the CTA button pointing to the reset URL.
 *
 * @param resetUrl - Complete URL with the token in plain text, e.g.
 *                   `https://dashboard.beechcms.dev/reset-password?token=<uuid>`.
 *                   It is directly embedded in the CTA button — do not sanitize
 *                   further: the token is an internally generated UUID.
 * @param locale   - Language for the email subject and body.
 * @returns Object with `subject` (string) and `html` (complete HTML document).
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
