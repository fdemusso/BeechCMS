// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction } from '@beechcms/core'
import { signWebhookBody } from '@beechcms/core/webhook-crypto'
import type { ResolvedContext } from '../context-resolver'
import { interpolate } from '../automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

const WEBHOOK_TIMEOUT_MS = 8_000

let warnedNoSecret = false

export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
  env: Record<string, string | undefined>,
): Promise<void> {
  const body = interpolate(action.body_template ?? '{}', context)

  const secret = env.WEBHOOK_SECRET
  let signatureHeader: Record<string, string> = {}
  if (secret) {
    signatureHeader = { 'X-BeechCMS-Signature': await signWebhookBody(body, secret) }
  } else if (!warnedNoSecret) {
    warnedNoSecret = true
    console.warn('[webhook] WEBHOOK_SECRET not set — outgoing webhooks are unsigned')
  }

  try {
    const response = await fetch(action.url, {
      method: action.method ?? 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(action.headers ?? {}),
        ...signatureHeader,
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    })

    if (!response.ok) {
      throw new Error(`Webhook ${action.url} responded ${response.status}`)
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error(`Webhook ${action.url} timed out after ${WEBHOOK_TIMEOUT_MS}ms`)
    }
    throw err
  }
}
