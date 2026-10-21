// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyWebhookSignature } from '@beechcms/core/webhook-crypto'
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

  // HTML escaping corrupts quotes and leaves JSON control characters and backslashes unescaped.
  it.each([
    ['multiline text', 'line1\nline2\r\nline3'],
    ['trailing backslash', 'path\\'],
    ['control characters', Array.from({ length: 32 }, (_, code) => String.fromCharCode(code)).join('')],
    ['quotes and markup', '"O\'Brien" & <Sons>'],
    ['JSON structure text', '\\", "extra": true, "note": "'],
    ['Unicode text', 'Caffè 🌳 \u2028 \u2029'],
  ])('sends %s as a JSON string preserving the original value', async (_label, note) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))
    const action = { ...baseAction, body_template: '{"note":"{{this.note}}","static":true}' }
    const context = makeContext({ note })

    const delivery = executeWebhook(action, context, { WEBHOOK_SECRET: 'test-secret' })
    await delivery

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [, init] = fetchSpy.mock.calls[0]
    const body = init?.body as string
    expect(body).toBe(JSON.stringify({ note, static: true }))
    expect(JSON.parse(body)).toEqual({ note, static: true })
    const headers = init?.headers as Record<string, string>
    expect(await verifyWebhookSignature(body, headers['X-BeechCMS-Signature'], 'test-secret')).toBe(true)
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

  // A mocked fetch hides runtime validation: build a real Request so GET-with-body throws like workerd.
  it('sends GET without body or Content-Type so the Fetch API accepts it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      new Request(input as string, init)
      return makeOkResponse()
    })
    const action = { ...baseAction, method: 'GET' as const }

    await executeWebhook(action, baseContext, { WEBHOOK_SECRET: 'test-secret' })

    const [, init] = fetchSpy.mock.calls[0]
    const headers = init?.headers as Record<string, string>
    expect(init?.body).toBeUndefined()
    expect(headers['Content-Type']).toBeUndefined()
    expect(headers['X-BeechCMS-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  // The schema only runs when an automation is saved. Rows written before a rule tightened, or by
  // any path that skips the schema, reach the executor unchecked, so it re-validates before egress.
  it.each([
    ['plain HTTP', 'http://example.com/hook'],
    ['localhost', 'https://localhost/hook'],
    ['IPv4 loopback', 'https://127.0.0.1/hook'],
    ['IPv6 loopback', 'https://[::1]/hook'],
    ['IPv4-mapped IPv6 metadata address', 'https://[::ffff:a9fe:a9fe]/latest/meta-data/'],
    ['NAT64 loopback', 'https://[64:ff9b::7f00:1]/hook'],
  ])('refuses to send a stored webhook pointing at %s and never calls fetch', async (_label, url) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())

    const delivery = executeWebhook({ ...baseAction, url }, baseContext, { WEBHOOK_SECRET: 'test-secret' })

    await expect(delivery).rejects.toThrow('blocked')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('delivers to a localhost URL only when ENV is development', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())
    const localAction = { ...baseAction, url: 'http://localhost:8080/hook' }

    await executeWebhook(localAction, baseContext, { ENV: 'development' })

    expect(fetchSpy).toHaveBeenCalledOnce()
    await expect(executeWebhook(localAction, baseContext, { ENV: 'production' })).rejects.toThrow('blocked')
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  // A public host can answer 3xx with a Location pointing inside the network; following it would
  // send the request to an address the URL check never saw.
  it('does not follow redirects so a public host cannot bounce the request to a private one', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeOkResponse())

    await executeWebhook(baseAction, baseContext, {})

    const [, init] = fetchSpy.mock.calls[0]
    expect(init?.redirect).toBe('manual')
  })
})
