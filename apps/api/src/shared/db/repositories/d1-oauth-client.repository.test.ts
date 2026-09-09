// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1OAuthClientRepository } from './d1-oauth-client.repository'

function makeMockDb(firstResult: unknown = null) {
  const firstMock = vi.fn().mockResolvedValue(firstResult)
  const bindMock = vi.fn(() => ({ first: firstMock }))
  const prepareMock = vi.fn(() => ({ bind: bindMock }))
  return { db: { prepare: prepareMock } as any, bindMock, firstMock }
}

describe('D1OAuthClientRepository', () => {
  describe('findActiveById', () => {
    it('returns null when no row matches (disabled or unknown client)', async () => {
      const { db } = makeMockDb(null)
      const record = await new D1OAuthClientRepository(db).findActiveById('unknown')
      expect(record).toBeNull()
    })

    it('binds the requested clientId', async () => {
      const { db, bindMock } = makeMockDb(null)
      await new D1OAuthClientRepository(db).findActiveById('beech-mcp-cli')
      expect(bindMock).toHaveBeenCalledWith('beech-mcp-cli')
    })

    it('maps a row to a record, parsing redirect_uris JSON and scope string', async () => {
      const row = {
        client_id: 'beech-mcp-cli',
        name: 'Beech MCP CLI',
        redirect_uris: '["http://localhost:9876/callback"]',
        allowed_scopes: 'schema:read schema:write',
        is_public: 1,
        created_at: 1700000000,
        disabled_at: null,
      }
      const { db } = makeMockDb(row)
      const record = await new D1OAuthClientRepository(db).findActiveById('beech-mcp-cli')
      expect(record).toEqual({
        clientId: 'beech-mcp-cli',
        name: 'Beech MCP CLI',
        redirectUris: ['http://localhost:9876/callback'],
        allowedScopes: ['schema:read', 'schema:write'],
        isPublic: true,
        createdAt: 1700000000,
        disabledAt: null,
      })
    })

    it('falls back to an empty redirectUris array on malformed JSON', async () => {
      const row = {
        client_id: 'c1',
        name: 'Broken',
        redirect_uris: 'not-json',
        allowed_scopes: '',
        is_public: 0,
        created_at: 1700000000,
        disabled_at: null,
      }
      const { db } = makeMockDb(row)
      const record = await new D1OAuthClientRepository(db).findActiveById('c1')
      expect(record?.redirectUris).toEqual([])
      expect(record?.isPublic).toBe(false)
    })
  })
})
