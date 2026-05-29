// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { ResendEmailProvider } from './providers/resend'
import { SmtpEmailProvider } from './providers/smtp'
import { buildPasswordResetEmail } from './templates/password-reset'
import { buildPasswordChangedEmail } from './templates/password-changed'
import { buildAutomationEmail } from './templates/automation-mail'
import type { EmailProvider } from './email.provider'
import type {
  PasswordResetEmailParams,
  PasswordChangedEmailParams,
  AutomationMailParams,
} from './email.types'

const DEFAULT_FROM = 'Beech CMS <onboarding@resend.dev>'

export interface EmailProviderEnv {
  /** "smtp" | "resend"; default "resend" if absent */
  provider?: string
  /** Resend API key, used when provider is "resend" */
  apiKey?: string
  /** Mailpit base URL (e.g. http://localhost:8025), used when provider is "smtp" */
  smtpBaseUrl?: string
  isDev?: boolean
}

// TODO: il sistema di selezione provider è attualmente hardcoded su "smtp" | "resend".
// Sarebbe meglio aprirlo a provider di terze parti (Postmark, SendGrid, Brevo, SES, ...)
// senza che l'utente debba toccare il codice. Opzioni da valutare:
//   1. Strategia plugin: EMAIL_PROVIDER accetta un path a modulo ES (`./my-provider.ts`)
//      che esporta default class implementing EmailProvider — zero lock-in.
//   2. Provider SMTP generico: rimuovere il coupling con Mailpit dalla denominazione
//      e accettare qualsiasi server SMTP via SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
//      (il SmtpEmailProvider attuale usa già l'HTTP API di Mailpit, non SMTP raw —
//      andrebbe riscritto con nodemailer o un client SMTP standard per coprire qualsiasi server).
//   3. Webhook email: EMAIL_PROVIDER=webhook + EMAIL_WEBHOOK_URL per integrazioni custom.
// Riferimento: email.provider.ts definisce l'interfaccia — è già sufficientemente astratta.
function createProvider(env: EmailProviderEnv): EmailProvider {
  if (env.provider === 'smtp') {
    if (!env.smtpBaseUrl) throw new Error('SMTP provider selected but SMTP_HOST is missing')
    return new SmtpEmailProvider({ baseUrl: env.smtpBaseUrl })
  }
  return new ResendEmailProvider(env.apiKey ?? '', env.isDev ?? false)
}

export async function sendPasswordResetEmail(
  params: PasswordResetEmailParams,
): Promise<void> {
  const provider = createProvider({
    provider: params.provider,
    apiKey: params.apiKey,
    smtpBaseUrl: params.smtpBaseUrl,
    isDev: params.isDev ?? false,
  })
  const { subject, html } = buildPasswordResetEmail(params.resetUrl, params.locale)
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [params.to],
    subject,
    html,
  })
}

export async function sendPasswordChangedEmail(
  params: PasswordChangedEmailParams,
): Promise<void> {
  const provider = createProvider({
    provider: params.provider,
    apiKey: params.apiKey,
    smtpBaseUrl: params.smtpBaseUrl,
    isDev: params.isDev ?? false,
  })
  const { subject, html } = buildPasswordChangedEmail(params.locale)
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [params.to],
    subject,
    html,
  })
}

export async function sendAutomationMail(params: AutomationMailParams): Promise<void> {
  const provider = createProvider({
    provider: params.provider,
    apiKey: params.apiKey ?? params.resendApiKey,
    smtpBaseUrl: params.smtpBaseUrl,
    isDev: false,
  })
  const message = buildAutomationEmail(params)
  await provider.send({
    from: params.from ?? DEFAULT_FROM,
    to: [message.to],
    subject: message.subject,
    html: message.html,
  })
}
