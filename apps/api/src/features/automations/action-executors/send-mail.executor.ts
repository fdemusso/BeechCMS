import type { AutomationAction } from '@beechcms/core'
import { sendAutomationMail } from '../../email'
import { interpolate } from '../automation-runner.utils'

type SendMailAction = Extract<AutomationAction, { type: 'send_mail' }>

export async function executeSendMail(
  action: SendMailAction,
  entry: Record<string, unknown>,
  env: { RESEND_API_KEY?: string; EMAIL_FROM?: string },
): Promise<void> {
  await sendAutomationMail({
    to: interpolate(action.to, entry),
    subject: interpolate(action.subject_template, entry),
    body: interpolate(action.body_template, entry),
    resendApiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
  })
}
