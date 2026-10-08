// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Rotate-field slice — integration tier. POST /:slug/:id/rotate-field must verify and store
 * `hash`-classified values with the same keyed HMAC the repository applies on every other write
 * path (#600). The handler unit test seeds an unsalted SHA-256 digest and mocks the repository,
 * so it cannot see a divergence from the real storage format.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { defineSeed, PrivacyService, sha256hex, type Branch } from '@beechcms/core'
import { createTestHarness, type TestClient, type TestHarness } from '@beechcms/testing'
import { createBeechApp } from '../../../../factory'
import { __resetSeedRegistryCache } from '../../../../shared/services/cache/seed-registry-cache'

const MASTER_KEY = 'test-master-key-32-chars-minimum-1234567890'

const pinSeed = defineSeed({
  slug: 'rf_users',
  label: 'rf_users',
  labelPlural: 'rf_users',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true } as Branch,
    { id: 'br_02', alias: 'pin', label: 'Pin', type: 'text', policies: { privacy: 'hash' } } as Branch,
  ],
})

describe('rotate-field slice — keyed hash integration (real D1)', () => {
  let harness: TestHarness
  let admin: TestClient
  let entryId: string
  const privacy = new PrivacyService(MASTER_KEY)

  beforeEach(async () => {
    __resetSeedRegistryCache()
    harness = await createTestHarness({
      db: env.DB,
      seeds: [pinSeed],
      env: {
        MEDIA_BUCKET: (env as unknown as Record<string, unknown>).MEDIA_BUCKET,
        PRIVACY_MASTER_KEY: MASTER_KEY,
      },
      createApp: (authProviders) => createBeechApp({ seeds: [], authProviders }),
    })
    admin = await harness.asUser('admin')
    const created = await admin.post('/api/content/rf_users', { name: 'Ada', slug: 'rf-ada', pin: '1234' })
    expect(created.status).toBe(201)
    entryId = (await created.json<{ id: string }>()).id
  })

  async function storedPin(): Promise<string> {
    const row = await harness.db.prepare('SELECT pin FROM content_rf_users WHERE id = ?').bind(entryId).first<{ pin: string }>()
    return row!.pin
  }

  function rotate(currentValue: string, nextValue: string) {
    return admin.post(`/api/content/rf_users/${entryId}/rotate-field`, { fieldAlias: 'pin', currentValue, nextValue })
  }

  it('accepts the correct current value and stores the next value as keyed HMAC', async () => {
    const response = await rotate('1234', '5678')

    expect(response.status).toBe(200)
    const stored = await storedPin()
    expect(stored).toBe(await privacy.hash('5678'))
    expect(stored).not.toBe(await sha256hex('5678'))
  })

  it('rejects a wrong current value with 403 and leaves the stored hash untouched', async () => {
    const before = await storedPin()

    const response = await rotate('0000', '5678')

    expect(response.status).toBe(403)
    expect(await storedPin()).toBe(before)
  })

  it('lets the rotated value be rotated again', async () => {
    expect((await rotate('1234', '5678')).status).toBe(200)

    const response = await rotate('5678', '9999')

    expect(response.status).toBe(200)
    expect(await storedPin()).toBe(await privacy.hash('9999'))
  })

  it('stores the sanitized next value, matching what create/update would hash for the same input', async () => {
    const rawNext = '  5678\u0007  '

    const response = await rotate('1234', rawNext)

    expect(response.status).toBe(200)
    const stored = await storedPin()
    expect(stored).toBe(await privacy.hash('5678'))
    expect(stored).not.toBe(await privacy.hash(rawNext))
  })

  it('throttles repeated rotation attempts against the same entry and field', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await rotate('0000', '5678')
      expect(res.status).toBe(403)
    }

    const blocked = await rotate('0000', '5678')

    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).not.toBeNull()
    // The bucket is exhausted even for the correct current value: the limiter runs before
    // the current-value check, closing the brute-force oracle regardless of outcome.
    expect((await rotate('1234', '5678')).status).toBe(429)
    expect(await storedPin()).toBe(await privacy.hash('1234'))
  })
})
