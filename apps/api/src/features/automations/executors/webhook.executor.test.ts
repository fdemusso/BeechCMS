// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeWebhook } from './webhook.executor'
import type { ResolvedContext } from '../evaluator/context-resolver'

function makeContext(entry: Record<string, unknown> = {}, event = 'create'): ResolvedContext {
  return {
    triggerEntry: entry,
    lookup(parsed) {
      if (parsed.kind === 'simple') {
        const key = parsed.path.startsWith('this.') ? parsed.path.slice(5) : parsed.path
        if (key === 'trigger_event') return event
        return entry[key] ?? null
      }
      return null
    },
  }
}

const baseContext = makeContext({ id: 'entry-1', title: 'Hello' })

const baseAction = {
  type: 'webhook' as const,
  url: 'https://example.com/hook',
  body_template: '{"static":true}',
}

function makeOkResponse(status = 200): Response {
  return { ok: true, status } as unknown as Response
}

function makeErrorResponse(status: number): Response {
  return { ok: false, status } as unknown as Response
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('executeWebhook', () => {
  it('signs request when WEBHOOK_SECRET is set', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())

    await executeWebhook(baseAction, baseContext, { WEBHOOK_SECRET: 'test-secret' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['X-BeechCMS-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('omits signature header and warns once when WEBHOOK_SECRET is absent', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await executeWebhook(baseAction, baseContext, {})
    await executeWebhook(baseAction, baseContext, {})

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['X-BeechCMS-Signature']).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('WEBHOOK_SECRET')
  })

  it('overwrites user-supplied X-BeechCMS-Signature header with computed value', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())

    const action = {
      ...baseAction,
      headers: { 'X-BeechCMS-Signature': 'sha256=user-supplied-value' },
    }

    await executeWebhook(action, baseContext, { WEBHOOK_SECRET: 'test-secret' })

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(headers['X-BeechCMS-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
    expect(headers['X-BeechCMS-Signature']).not.toBe('sha256=user-supplied-value')
  })

  it('throws with status code when endpoint responds with 500', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeErrorResponse(500))

    await expect(executeWebhook(baseAction, baseContext, {}))
      .rejects.toThrow('500')
  })

  it('interpolates body_template placeholders before sending', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())

    const action = { ...baseAction, body_template: '{"event":"{{trigger_event}}","id":"{{id}}"}' }
    const ctx = makeContext({ id: 'abc-123' }, 'update')

    await executeWebhook(action, ctx, {})

    const [, init] = fetchSpy.mock.calls[0]
    const body = init?.body as string
    expect(body).toContain('abc-123')
    expect(body).toContain('update')
  })

  it('recalculates HMAC and matches X-BeechCMS-Signature header', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())
    const secret = 'verify-secret'

    await executeWebhook(baseAction, baseContext, { WEBHOOK_SECRET: secret })

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    const sentBody = init?.body as string
    const sentSig = headers['X-BeechCMS-Signature']

    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(sentBody))
    const expected = 'sha256=' + Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    expect(sentSig).toBe(expected)
  })

  it('throws timeout error when fetch takes longer than 8 seconds', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const err = new DOMException('The operation was aborted.', 'TimeoutError')
      return Promise.reject(err)
    })

    await expect(executeWebhook(baseAction, baseContext, {}))
      .rejects.toThrow('timed out after 8000ms')
  })
})
