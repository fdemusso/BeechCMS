import type { AutomationAction } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { sendAutomationMail } from '../../email'
import { interpolate } from '../automation-runner.utils'

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

  const apiKey = env.EMAIL_API_KEY ?? env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[automations:send_mail] Execution skipped: Email API key is missing from the environment configuration.')
    return
  }

  try {
    await sendAutomationMail({
      to,
      subject,
      body,
      apiKey,
      from: env.EMAIL_FROM,
    })
  } catch (error) {
    console.error('[automations:send_mail] failed to send automation email via provider:', error)
    throw error
  }
}
