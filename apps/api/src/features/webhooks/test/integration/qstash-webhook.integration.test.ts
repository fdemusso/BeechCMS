// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Webhooks slice — integration tier. QStash delivers at least once, so a redelivery of the same
 * message (acknowledgement lost after the insert committed) must not add a second inbox row (#586).
 * The unit suite mocks the Receiver and the repository and issues one request per test, so it can
 * neither repeat a delivery nor see what D1 actually stored.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createExecutionContext, env } from 'cloudflare:test'
import { createTestHarness, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const SIGNING_KEY = 'qstash-test-signing-key'
const WEBHOOK_URL = 'http://localhost/api/webhooks/qstash'

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const encode = (value: string) => new TextEncoder().encode(value)

// Signs the same HS256 JWT QStash attaches to each delivery (iss, sub = target URL, body hash), so the
// real Receiver verifies it. The Receiver checks exp/nbf against wall-clock time, not the IClock.
async function signDelivery(body: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const bodyHash = toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encode(body))))
  const header = toBase64Url(encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const claims = toBase64Url(
    encode(
      JSON.stringify({
        iss: 'Upstash',
        sub: WEBHOOK_URL,
        iat: nowSeconds,
        nbf: nowSeconds,
        exp: nowSeconds + 300,
        jti: 'jwt_unique_per_attempt',
        body: bodyHash,
      }),
    ),
  )
  const key = await crypto.subtle.importKey('raw', encode(SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encode(`${header}.${claims}`)))
  return `${header}.${claims}.${toBase64Url(signature)}`
}

describe('webhooks slice — integration (real D1)', () => {
  let harness: TestHarness

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      env: { QSTASH_CURRENT_SIGNING_KEY: SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY: SIGNING_KEY },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    await harness.db.prepare('DELETE FROM notifications').run()
  })

  // Every attempt of one QStash message carries the same Upstash-Message-Id; a different message
  // carries a different one, even when the payload is identical.
  async function deliver(body: string, messageId: string): Promise<Response> {
    return harness.app.request(
      '/api/webhooks/qstash',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Upstash-Signature': await signDelivery(body),
          'Upstash-Message-Id': messageId,
        },
        body,
      },
      harness.env,
      createExecutionContext(),
    )
  }

  async function storedNotifications(): Promise<{ title: string }[]> {
    const { results } = await harness.db.prepare('SELECT title FROM notifications').all<{ title: string }>()
    return results
  }

  describe('POST /api/webhooks/qstash', () => {
    const payload = JSON.stringify({ title: 'One event', message: 'One notification' })

    it('a redelivered message is acknowledged without adding a second notification', async () => {
      await deliver(payload, 'msg_redelivered')

      const retry = await deliver(payload, 'msg_redelivered')

      expect(retry.status).toBe(200)
      expect(await storedNotifications()).toEqual([{ title: 'One event' }])
    })

    it('concurrent attempts of one message store exactly one notification', async () => {
      const responses = await Promise.all([
        deliver(payload, 'msg_concurrent'),
        deliver(payload, 'msg_concurrent'),
        deliver(payload, 'msg_concurrent'),
      ])

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
      expect(await storedNotifications()).toEqual([{ title: 'One event' }])
    })

    it('two distinct messages with an identical payload each store a notification', async () => {
      await deliver(payload, 'msg_first')

      const second = await deliver(payload, 'msg_second')

      expect(second.status).toBe(200)
      expect(await storedNotifications()).toHaveLength(2)
    })
  })
})
