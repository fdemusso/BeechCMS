import type { AutomationAction } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { interpolate } from '../automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
): Promise<void> {
  const entry = context.triggerEntry ?? {}
  const body = action.body_template
    ? interpolate(action.body_template, context)
    : JSON.stringify(entry)

  const response = await fetch(action.url, {
    method: action.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...(action.headers ?? {}) },
    body,
  })

  if (!response.ok) {
    throw new Error(`Webhook ${action.url} responded ${response.status}`)
  }
}
