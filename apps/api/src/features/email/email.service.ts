/**
 * Email Service — orchestrator of the Beech CMS email module.
 *
 * Sending pipeline:
 *   caller → service function → template builder → provider → Resend (or other)
 *
 * This is the only file that imports from both templates and the provider.
 * No other layer knows the entire pipeline.
 *
 * ─── CHANGING PROVIDER ───────────────────────────────────────────────────────
 * To replace Resend with another service, ONLY modify the
 * `createProvider()` function below: change the import and instantiation.
 * No other module file — nor anywhere else in the project — needs to be touched.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { ResendEmailProvider } from './providers/resend'
import { buildPasswordResetEmail } from './templates/password-reset'
import { buildPasswordChangedEmail } from './templates/password-changed'
import { buildAutomationEmail } from './templates/automation-mail'
import type { EmailProvider } from './email.provider'
import type {
  PasswordResetEmailParams,
  PasswordChangedEmailParams,
  AutomationMailParams,
} from './email.types'

/** Default sender address (Resend test sender, works without a verified domain). */
const DEFAULT_FROM = 'Beech CMS <onboarding@resend.dev>'

/**
 * Instantiates the active email provider.
 *
 * This is the single point for changing the provider: replace the
 * `new ResendEmailProvider(...)` line with any class that implements `EmailProvider`.
 */
function createProvider(apiKey: string, isDev: boolean): EmailProvider {
  return new ResendEmailProvider(apiKey, isDev)
}

/**
 * Sends the password reset link email to the specified recipient.
 *
 * The email body is built from the localized template in
 * `templates/password-reset.ts` and composed with the base layout in
 * `templates/shell.ts`.
 *
 * @throws If the provider rejects the request. The caller decides whether to propagate
 *         the error (request fail) or handle it silently (fire-and-forget).
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
 * Sends the "password changed" security notification to the account owner.
 *
 * Called after a successful password reset to notify the user. It does not have a
 * CTA button — it is a pure notification, no action required from the user.
 *
 * @throws If the provider rejects the request.
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

export async function sendAutomationMail(params: AutomationMailParams): Promise<void> {
  const provider = createProvider(params.resendApiKey ?? '', false)
  const message = buildAutomationEmail(params)
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [message.to],
    subject: message.subject,
    html: message.html,
  })
}
