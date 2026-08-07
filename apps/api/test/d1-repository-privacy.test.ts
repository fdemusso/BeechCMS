// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1ContentRepository } from '../src/shared/db/repositories/content.repository.d1'
import { PrivacyService, type Seed } from '@beechcms/core'

const PRIVACY_SEED: Seed = {
  slug: 'users',
  displayNameAlias: 'name',
  label: 'User',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { privacy: 'plain' } },
    { id: 'br_02', alias: 'ssn', label: 'SSN', type: 'text', policies: { privacy: 'encrypt' } },
    { id: 'br_03', alias: 'email_hash', label: 'Email Hash', type: 'text', policies: { privacy: 'hash' } },
  ],
}

function makeMockDb() {
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } })
  const firstMock = vi.fn().mockResolvedValue(null)
  const allMock = vi.fn().mockResolvedValue({ results: [] })
  const bindMock = vi.fn((..._args: any[]) => ({ run: runMock, first: firstMock, all: allMock }))
  const stmt = { bind: bindMock, run: runMock, first: firstMock, all: allMock }
  const prepareMock = vi.fn(() => stmt)
  const batchMock = vi.fn().mockResolvedValue([])
  return { db: { prepare: prepareMock, batch: batchMock } as any, prepareMock, bindMock, runMock, firstMock, allMock, batchMock }
}

describe('D1ContentRepository — Privacy & ALE Integration', () => {
  const masterKey = 'super-secret-master-key-32-chars-long'
  const privacyService = new PrivacyService(masterKey)

  it('encrypts encrypted fields and hashes hashed fields on create', async () => {
    const { db, prepareMock, bindMock } = makeMockDb()
    const repo = new D1ContentRepository(db, undefined, privacyService)

    await repo.create(PRIVACY_SEED, 'id_1', 'user-1', 'published', {
      name: 'John Doe',
      ssn: '123-45-6789',
      email_hash: 'john@example.com',
    })

    expect(prepareMock).toHaveBeenCalled()
    const boundArgs = bindMock.mock.calls.find((call) => call[0] === 'id_1')!
    expect(boundArgs[3]).toBe('John Doe')
    expect(boundArgs[4]).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
    expect(boundArgs[5]).toHaveLength(64)
  })

  it('decrypts encrypted fields on read (findById)', async () => {
    const encryptedSsn = await privacyService.encrypt('123-45-6789')
    const emailHash = await privacyService.hash('john@example.com')

    const { db, firstMock } = makeMockDb()
    firstMock.mockResolvedValueOnce({
      id: 'id_1',
      slug: 'user-1',
      status: 'published',
      name: 'John Doe',
      ssn: encryptedSsn,
      email_hash: emailHash,
      created_at: 1000,
      updated_at: 1000,
    })

    const repo = new D1ContentRepository(db, undefined, privacyService)
    const result = await repo.findById(PRIVACY_SEED, 'id_1')

    expect(result.name).toBe('John Doe')
    expect(result.ssn).toBe('123-45-6789')
    expect(result.email_hash).toBe(emailHash)
  })

  it('encrypts fields on update', async () => {
    const { db, prepareMock, bindMock } = makeMockDb()
    const repo = new D1ContentRepository(db, undefined, privacyService)

    await repo.update(PRIVACY_SEED, 'id_1', {
      ssn: '987-65-4321',
    })

    expect(prepareMock).toHaveBeenCalled()
    const boundArgs = bindMock.mock.calls.find((call) => typeof call[0] === 'string' && call[0].startsWith('v1:'))!
    expect(boundArgs[0]).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
  })
})
