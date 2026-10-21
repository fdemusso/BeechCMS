// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isPrivateHost, type AutomationAction } from '@beechcms/core'
import { signWebhookBody } from '@beechcms/core/webhook-crypto'
import type { ResolvedContext } from '../evaluator/context-resolver'
import { interpolate } from '../engine/automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

const WEBHOOK_TIMEOUT_MS = 8_000

let warnedNoSecret = false

// The schema check runs only at save time; this is the last gate before the request leaves the Worker.
function assertPublicHttpsUrl(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('Webhook URL blocked: not a valid URL')
  }
  if (parsed.protocol !== 'https:') throw new Error('Webhook URL blocked: HTTPS required')
  if (isPrivateHost(parsed.hostname)) throw new Error('Webhook URL blocked: private or internal host')
}

export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
  env: Record<string, string | undefined>,
): Promise<void> {
  assertPublicHttpsUrl(action.url)


  // Fetch forbids a body on GET, so a GET webhook carries none and signs the empty payload.
  const isGet = action.method === 'GET'
  const body = isGet ? undefined : interpolate(action.body_template ?? '{}', context, { escape: 'json' })

  const secret = env.WEBHOOK_SECRET
  let signatureHeader: Record<string, string> = {}
  if (secret) {
    signatureHeader = { 'X-BeechCMS-Signature': await signWebhookBody(body ?? '', secret) }
  } else if (!warnedNoSecret) {
    warnedNoSecret = true
    console.warn('[webhook] WEBHOOK_SECRET not set — outgoing webhooks are unsigned')
  }

  try {
    const response = await fetch(action.url, {
      method: action.method ?? 'POST',
      headers: {
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        ...(action.headers ?? {}),
        ...signatureHeader,
      },
      ...(body === undefined ? {} : { body }),
      // A 3xx would send the request to a Location the host check never saw; it surfaces as a non-ok failure.
      redirect: 'manual',
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
