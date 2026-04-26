/**
 * Email Service — orchestratore del modulo email di Beech CMS.
 *
 * Pipeline di invio:
 *   chiamante → funzione service → template builder → provider → Resend (o altro)
 *
 * Questo è l'unico file che importa sia dai template che dal provider.
 * Nessun altro layer conosce l'intera pipeline.
 *
 * ─── CAMBIO PROVIDER ─────────────────────────────────────────────────────────
 * Per sostituire Resend con un altro servizio, modifica SOLO la funzione
 * `createProvider()` qui sotto: cambia l'import e l'istanziazione.
 * Nessun altro file del modulo — né nel resto del progetto — va toccato.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ResendEmailProvider } from './providers/resend'
import { buildPasswordResetEmail } from './templates/password-reset'
import { buildPasswordChangedEmail } from './templates/password-changed'
import type { EmailProvider } from './email.provider'
import type {
  PasswordResetEmailParams,
  PasswordChangedEmailParams,
} from './email.types'

/** Indirizzo mittente di default (mittente di test Resend, funziona senza dominio verificato). */
const DEFAULT_FROM = 'Beech CMS <onboarding@resend.dev>'

/**
 * Istanzia il provider email attivo.
 *
 * Questo è il punto singolo di cambio provider: sostituisci la riga
 * `new ResendEmailProvider(…)` con qualsiasi classe che implementi `EmailProvider`.
 */
function createProvider(apiKey: string, isDev: boolean): EmailProvider {
  return new ResendEmailProvider(apiKey, isDev)
}

/**
 * Invia l'email con il link di reset password al destinatario specificato.
 *
 * Il corpo dell'email è costruito dal template localizzato in
 * `templates/password-reset.ts` e composto con il layout base in
 * `templates/shell.ts`.
 *
 * @throws Se il provider rifiuta la richiesta. Il chiamante decide se propagare
 *         l'errore (fail della request) o gestirlo silenziosamente (fire-and-forget).
 */
export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams,
): Promise<void> {
  const provider = createProvider(params.apiKey, params.isDev ?? false)
  const { subject, html } = buildPasswordResetEmail(params.resetUrl, params.locale)
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [params.to],
    subject,
    html,
  })
}

/**
 * Invia la notifica di sicurezza "password modificata" al proprietario dell'account.
 *
 * Chiamata dopo un reset password riuscito per avvisare l'utente. Non ha un
 * pulsante CTA — è una pura notifica, nessuna azione richiesta all'utente.
 *
 * @throws Se il provider rifiuta la richiesta.
 */
export async function sendPasswordChangedEmail(
  params: PasswordChangedEmailParams,
): Promise<void> {
  const provider = createProvider(params.apiKey, params.isDev ?? false)
  const { subject, html } = buildPasswordChangedEmail(params.locale)
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [params.to],
    subject,
    html,
  })
}
