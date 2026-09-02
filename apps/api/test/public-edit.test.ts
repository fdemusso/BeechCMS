// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineSeed } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { __resetSeedRegistryCache } from '../src/shared/services/cache/seed-registry-cache'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { StaticAutomationRepository } from './mocks/static-automation.repository'
import { TEST_ENV, TEST_PUBLIC_WRITE_KEY } from './fixtures'

describe('Public Edit Integration & Confidential Lifecycle', () => {
  const EDITABLE_SEED = defineSeed({
    slug: 'profiles',
    label: 'Profile',
    displayNameAlias: 'name',
    allowPublicPost: true,
    allowPublicEdit: true,
    branches: [
      { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { classification: 'public' } },
      { id: 'br_02', alias: 'phone', label: 'Phone', type: 'text', policies: { classification: 'confidential', publicEdit: true } },
      { id: 'br_03', alias: 'ssn', label: 'SSN', type: 'text', policies: { classification: 'confidential' } },
      { id: 'br_04', alias: 'admin_notes', label: 'Admin Notes', type: 'text', policies: { classification: 'internal' } },
      { id: 'br_05', alias: 'security_pin', label: 'Security PIN', type: 'text', policies: { classification: 'restricted' } },
      { id: 'br_06', alias: 'hidden_bio', label: 'Hidden Bio', type: 'text', policies: { public: false } },
    ],
  })

  let repo: StaticContentRepository
  let mockAutomationRunner: { run: any }
  let app: ReturnType<typeof createBeechApp>

  const existingEntry = {
    id: 'a0000000-0000-4000-8000-000000000001',
    slug: 'jane-profile',
    status: 'published',
    name: 'Jane Doe',
    phone: '+1-555-0100',
    ssn: 'SECRET-SSN',
    admin_notes: 'VIP client',
    security_pin: 'hash_pin_123',
    hidden_bio: 'private bio',
    created_at: 1000,
    updated_at: 1000,
  }

  beforeEach(() => {
    __resetSeedRegistryCache()
    repo = new StaticContentRepository([EDITABLE_SEED])
    repo.load('profiles', [{ ...existingEntry }])
    mockAutomationRunner = {
      run: vi.fn().mockResolvedValue({ success: true }),
    }
    app = createBeechApp({
      seeds: [EDITABLE_SEED],
      repository: repo,
      idempotencyRepository: new StaticIdempotencyRepository(),
      automationRepository: new StaticAutomationRepository(),
      automationRunner: mockAutomationRunner as any,
    })
  })

  it('rejects internal and restricted fields on public edit with HTTP 422', async () => {
    const res = await app.request(`/api/v1/public/profiles/edit/${existingEntry.id}`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          admin_notes: 'tampered note',
          security_pin: 'new_pin',
        },
      }),
    }, TEST_ENV)

    expect(res.status).toBe(422)
    const body = await res.json<{ type: string; title: string; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/sensitive-field-edit')
    expect(body.title).toBe('Unprocessable Entity')
    expect(body.detail).toBe('Cannot write internal/restricted fields: admin_notes, security_pin')
  })

  it('rejects confidential fields when publicEdit is not enabled (default false)', async () => {
    const res = await app.request(`/api/v1/public/profiles/edit/${existingEntry.id}`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          ssn: 'NEW-SSN-999',
        },
      }),
    }, TEST_ENV)

    expect(res.status).toBe(422)
    const body = await res.json<{ type: string; title: string; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/sensitive-field-edit')
    expect(body.title).toBe('Unprocessable Entity')
    expect(body.detail).toBe("Cannot edit sensitive field 'ssn': edit permission not granted by seed declaration")
  })

  it('rejects fields with public: false when publicEdit is not enabled', async () => {
    const res = await app.request(`/api/v1/public/profiles/edit/${existingEntry.id}`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          hidden_bio: 'new private bio',
        },
      }),
    }, TEST_ENV)

    expect(res.status).toBe(422)
    const body = await res.json<{ type: string; title: string; detail: string }>()
    expect(body.type).toBe('https://beechcms.dev/problems/sensitive-field-edit')
    expect(body.detail).toBe("Cannot edit sensitive field 'hidden_bio': edit permission not granted by seed declaration")
  })

  it('permits modifying confidential fields when publicEdit is true and dispatches cleartext to automation', async () => {
    const res = await app.request(`/api/v1/public/profiles/edit/${existingEntry.id}`, {
      method: 'PATCH',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          name: 'Jane Smith',
          phone: '+1-555-9999',
        },
      }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json<{ success: boolean; id: string; slug: string }>()
    expect(body.success).toBe(true)
    expect(body.id).toBe(existingEntry.id)

    expect(mockAutomationRunner.run).toHaveBeenCalledWith({
      seedSlug: 'profiles',
      event: 'update',
      entry: expect.objectContaining({
        id: existingEntry.id,
        name: 'Jane Smith',
        phone: '+1-555-9999',
        ssn: 'SECRET-SSN',
        admin_notes: 'VIP client',
        status: 'published',
      }),
    })
  })

  it('accepts flat JSON payload on PUT /edit/:id and returns enriched response with data and meta', async () => {
    const res = await app.request(`/api/v1/public/profiles/edit/${existingEntry.id}`, {
      method: 'PUT',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Jane Renamed',
      }),
    }, TEST_ENV)

    expect(res.status).toBe(200)
    const body = await res.json<{ success: boolean; id: string; slug: string; data: Record<string, unknown>; meta: { seed: string } }>()
    expect(body.success).toBe(true)
    expect(body.id).toBe(existingEntry.id)
    expect(body.slug).toBe('jane-profile')
    expect(body.data).toBeDefined()
    expect(body.data.name).toBe('Jane Renamed')
    expect(body.meta.seed).toBe('profiles')
  })
})
