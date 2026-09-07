// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import type { IIdGenerator } from '@beechcms/core'
import { D1OAuthConsentRepository } from './d1-oauth-consent.repository'

const NOW = 1700000000
const idGenerator: IIdGenerator = { uuid: () => 'x', isValid: (v): v is string => typeof v === 'string' }

function makeMockDb(opts: { firstResult?: unknown; allResults?: unknown[]; runChanges?: number } = {}) {
  const { firstResult = null, allResults = [], runChanges = 1 } = opts
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: runChanges } })
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const allMock = vi.fn().mockResolvedValue({ results: allResults })
  const bindMock = vi.fn(() => ({ first: firstMock, run: runMock, all: allMock }))
  const prepareMock = vi.fn((_sql: string) => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, prepareMock, bindMock, runMock, firstMock, allMock }
}

describe('D1OAuthConsentRepository', () => {
  describe('findActive', () => {
    it('returns null when no active consent row exists', async () => {
      const { db } = makeMockDb({ firstResult: null })
      const record = await new D1OAuthConsentRepository(db, idGenerator).findActive('c1', 'u1')
      expect(record).toBeNull()
    })

    it('maps a row to a record', async () => {
      const row = {
        id: 'oc1',
        client_id: 'c1',
        user_id: 'u1',
        scopes: 'schema:read',
        created_at: NOW,
        updated_at: NOW,
        revoked_at: null,
      }
      const { db } = makeMockDb({ firstResult: row })
      const record = await new D1OAuthConsentRepository(db, idGenerator).findActive('c1', 'u1')
      expect(record).toEqual({
        id: 'oc1',
        clientId: 'c1',
        userId: 'u1',
        scopes: ['schema:read'],
        createdAt: NOW,
        updatedAt: NOW,
        revokedAt: null,
      })
    })
  })

  describe('grant', () => {
    it('issues a single atomic upsert statement (no read-then-write)', async () => {
      const { db, prepareMock, firstMock } = makeMockDb()
      await new D1OAuthConsentRepository(db, idGenerator).grant(
        'oc1',
        'c1',
        'u1',
        ['schema:read'],
        NOW,
      )
      expect(prepareMock).toHaveBeenCalledTimes(1)
      expect(firstMock).not.toHaveBeenCalled()
      const sql = prepareMock.mock.calls[0][0] as string
      expect(sql).toContain('ON CONFLICT(client_id, user_id) DO UPDATE')
      expect(sql).toContain('revoked_at = NULL')
    })

    it('binds insert values followed by one (token, token) pair per requested scope', async () => {
      const { db, bindMock } = makeMockDb()
      await new D1OAuthConsentRepository(db, idGenerator).grant(
        'oc1',
        'c1',
        'u1',
        ['schema:read', 'schema:write'],
        NOW,
      )
      expect(bindMock).toHaveBeenCalledWith(
        'oc1',
        'c1',
        'u1',
        'schema:read schema:write',
        NOW,
        NOW,
        'schema:read',
        'schema:read',
        'schema:write',
        'schema:write',
      )
    })

    it('dedupes repeated scopes before building the CASE expression', async () => {
      const { db, prepareMock } = makeMockDb()
      await new D1OAuthConsentRepository(db, idGenerator).grant(
        'oc1',
        'c1',
        'u1',
        ['schema:read', 'schema:read'],
        NOW,
      )
      const sql = prepareMock.mock.calls[0][0] as string
      expect(sql.match(/CASE WHEN/g)?.length).toBe(1)
    })
  })

  describe('revoke', () => {
    it('returns true when a row was revoked', async () => {
      const { db } = makeMockDb({ runChanges: 1 })
      const revoked = await new D1OAuthConsentRepository(db, idGenerator).revoke('c1', 'u1', NOW)
      expect(revoked).toBe(true)
    })

    it('returns false when no active row matched', async () => {
      const { db } = makeMockDb({ runChanges: 0 })
      const revoked = await new D1OAuthConsentRepository(db, idGenerator).revoke('c1', 'u1', NOW)
      expect(revoked).toBe(false)
    })
  })

  describe('listForUser', () => {
    it('returns only active consents for that user, mapped to records', async () => {
      const row = {
        id: 'oc1',
        client_id: 'c1',
        user_id: 'u1',
        scopes: 'schema:read',
        created_at: NOW,
        updated_at: NOW,
        revoked_at: null,
      }
      const { db } = makeMockDb({ allResults: [row] })
      const records = await new D1OAuthConsentRepository(db, idGenerator).listForUser('u1')
      expect(records).toEqual([
        {
          id: 'oc1',
          clientId: 'c1',
          userId: 'u1',
          scopes: ['schema:read'],
          createdAt: NOW,
          updatedAt: NOW,
          revokedAt: null,
        },
      ])
    })

    it('returns an empty array when the query yields no rows', async () => {
      const { db } = makeMockDb({ allResults: [] })
      const records = await new D1OAuthConsentRepository(db, idGenerator).listForUser('u1')
      expect(records).toEqual([])
    })
  })
})
