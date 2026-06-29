// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1IdempotencyRepository } from './idempotency.repository.d1'

function makeMockDb(opts: { firstResult?: unknown } = {}) {
  const { firstResult = null } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn(() => ({ run: runMock, first: firstMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock }
}

describe('D1IdempotencyRepository', () => {
  describe('lookup', () => {
    it('returns a mapped IdempotencyRecord when the key is found', async () => {
      const row = {
        idempotency_key: 'idem-1',
        request_fingerprint: 'fp-abc',
        response_status: 200,
        response_body: '{"ok":true}',
        expires_at: 9999,
      }
      const { db } = makeMockDb({ firstResult: row })
      const result = await new D1IdempotencyRepository(db).lookup('idem-1')
      expect(result).toEqual({
        key: 'idem-1',
        fingerprint: 'fp-abc',
        responseStatus: 200,
        responseBody: '{"ok":true}',
        expiresAt: 9999,
      })
    })

    it('returns null when the key is not found', async () => {
      const { db } = makeMockDb({ firstResult: null })
      expect(await new D1IdempotencyRepository(db).lookup('missing')).toBeNull()
    })

    it('queries the correct table', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1IdempotencyRepository(db).lookup('k')
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('public_idempotency_keys'))
    })
  })

  describe('store', () => {
    it('calls INSERT INTO public_idempotency_keys with upsert on conflict', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1IdempotencyRepository(db).store({
        key: 'idem-1', fingerprint: 'fp', responseStatus: 201, responseBody: '{}', expiresAt: 9999,
      })
      const sql = prepareMock.mock.calls[0][0] as string
      expect(sql).toContain('INSERT INTO public_idempotency_keys')
      expect(sql).toContain('ON CONFLICT')
    })

    it('binds key, fingerprint, status, body, and expiresAt', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1IdempotencyRepository(db).store({
        key: 'idem-1', fingerprint: 'fp-x', responseStatus: 200, responseBody: '{"ok":1}', expiresAt: 8888,
      })
      const args = bindMock.mock.calls[0] as unknown[]
      expect(args).toContain('idem-1')
      expect(args).toContain('fp-x')
      expect(args).toContain(200)
      expect(args).toContain('{"ok":1}')
      expect(args).toContain(8888)
    })
  })

  describe('cleanup', () => {
    it('calls DELETE with the expiration timestamp', async () => {
      const { db, prepareMock, bindMock } = makeMockDb()
      await new D1IdempotencyRepository(db).cleanup(12345)
      expect(prepareMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM public_idempotency_keys'))
      expect(bindMock).toHaveBeenCalledWith(12345)
    })
  })
})
