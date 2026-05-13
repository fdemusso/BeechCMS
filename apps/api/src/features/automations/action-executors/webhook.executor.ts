import type { AutomationAction } from '@beechcms/core'
import { interpolate } from '../automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

export async function executeWebhook(
  action: WebhookAction,
  entry: Record<string, unknown>,
): Promise<void> {
  const body = action.body_template
    ? interpolate(action.body_template, entry)
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
