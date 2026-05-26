// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { AutomationAction } from '@beechcms/core'
import type { ResolvedContext } from '../context-resolver'
import { interpolate } from '../automation-runner.utils'

type WebhookAction = Extract<AutomationAction, { type: 'webhook' }>

const WEBHOOK_TIMEOUT_MS = 8_000

let warnedNoSecret = false

async function signBody(body: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  return 'sha256=' + Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function executeWebhook(
  action: WebhookAction,
  context: ResolvedContext,
  env: Record<string, string | undefined>,
): Promise<void> {
  const body = interpolate(action.body_template ?? '', context)

  const secret = env.WEBHOOK_SECRET
  let signatureHeader: Record<string, string> = {}
  if (secret) {
    signatureHeader = { 'X-BeechCMS-Signature': await signBody(body, secret) }
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
