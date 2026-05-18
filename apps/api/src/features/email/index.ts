/**
 * Public API — modulo email di Beech CMS
 *
 * Questo è l'UNICO file da importare da codice esterno a questa feature.
 * I dettagli implementativi interni (provider, template, shell) sono privati
 * alla slice e non devono mai essere importati direttamente dall'esterno.
 *
 * ─── FUNZIONI ESPORTATE ───────────────────────────────────────────────────────
 *   sendPasswordResetEmail    — invia l'email con il link di reset
 *   sendPasswordChangedEmail  — invia la notifica "password modificata"
 *
 * ─── TIPI E UTILITY ESPORTATI ────────────────────────────────────────────────
 *   EmailLocale               — 'en' | 'it'  (aggiungere lingue in email.types.ts)
 *   resolveEmailLocale        — resolver sicuro per locale da input non verificato
 *   PasswordResetEmailParams  — shape dei parametri per sendPasswordResetEmail
 *   PasswordChangedEmailParams — shape dei parametri per sendPasswordChangedEmail
 */

export { sendPasswordResetEmail, sendPasswordChangedEmail, sendAutomationMail } from './email.service'
export {
  resolveEmailLocale,
  SUPPORTED_EMAIL_LOCALES,
} from './email.types'
export type {
  EmailLocale,
  PasswordResetEmailParams,
  PasswordChangedEmailParams,
  AutomationMailParams,
} from './email.types'
