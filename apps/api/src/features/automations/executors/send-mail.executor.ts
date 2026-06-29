// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction } from '@beechcms/core'
import type { ResolvedContext } from '../evaluator/context-resolver'
import { sendAutomationMail } from '../../../shared/email/index'
import { interpolate } from '../engine/automation-runner.utils'

type SendMailAction = Extract<AutomationAction, { type: 'send_mail' }>

export async function executeSendMail(
  action: SendMailAction,
  context: ResolvedContext,
  env: Record<string, string | undefined>,
): Promise<void> {
  const missingFields: string[] = []
  const logMissing = (field: string) => missingFields.push(field)

  const to = interpolate(action.to, context, '[missing]', logMissing)
  const subject = interpolate(action.subject_template, context, '[missing]', logMissing)
  const body = interpolate(action.body_template, context, '[missing]', logMissing)

  if (missingFields.length > 0) {
    console.warn('[automations:send_mail] placeholders evaluated to default value due to missing concrete data:', missingFields)
  }

  const useSmtp = env.EMAIL_PROVIDER === 'smtp'
  const apiKey = env.EMAIL_API_KEY ?? env.RESEND_API_KEY
  if (!useSmtp && !apiKey) {
    console.error('[automations:send_mail] Execution skipped: Email API key is missing from the environment configuration.')
    return
  }

  const smtpBaseUrl = env.SMTP_HOST
    ? `http://${env.SMTP_HOST}:${env.SMTP_PORT ?? '8025'}`
    : undefined

  try {
    await sendAutomationMail({
      to,
      subject,
      body,
      apiKey: apiKey ?? '',
      from: env.EMAIL_FROM,
      provider: env.EMAIL_PROVIDER as 'smtp' | 'resend' | undefined,
      smtpBaseUrl,
    })
  } catch (error) {
    console.error('[automations:send_mail] failed to send automation email via provider:', error)
    throw error
  }
}
