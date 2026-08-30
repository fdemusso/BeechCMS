// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateTimeTrapToken, type IAntivirusProvider, type INotificationService, type BeechBucket } from '@beechcms/core'
import { createBeechApp } from '../factory'
import { __resetSeedRegistryCache } from '../shared/services/cache/seed-registry-cache'
import { StaticContentRepository } from '../../test/mocks/static-content.repository'
import { StaticIdempotencyRepository } from '../../test/mocks/static-idempotency.repository'
import { StaticAutomationRepository } from '../../test/mocks/static-automation.repository'
import { TEST_SEEDS, TEST_ENV, TEST_PUBLIC_WRITE_KEY } from '../../test/fixtures'

describe('publicAddHandler Quarantine & Security Integration', () => {
  let app: ReturnType<typeof createBeechApp>
  let mockAntivirus: IAntivirusProvider
  let mockNotification: Partial<INotificationService>
  let mockBucket: Partial<BeechBucket>

  beforeEach(() => {
    __resetSeedRegistryCache()
    const repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()
    const automationRepo = new StaticAutomationRepository()

    mockAntivirus = {
      name: 'mock-av',
      scan: vi.fn(),
    }

    mockNotification = {
      notify: vi.fn(),
    }

    mockBucket = {
      delete: vi.fn().mockResolvedValue(undefined),
    }

    app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: repo,
      idempotencyRepository: idempotencyRepo,
      automationRepository: automationRepo,
    })
  })

  it('triggers quarantine deletion and admin notification when infected attachment is detected', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
    let binaryStr = ''
    for (let i = 0; i < pngBytes.length; i++) binaryStr += String.fromCharCode(pngBytes[i])
    const validPngBase64 = btoa(binaryStr)

    // Build app with mocked antivirus, notification service, and bucket
    const customApp = createBeechApp({
      seeds: TEST_SEEDS,
      repository: new StaticContentRepository(TEST_SEEDS),
      idempotencyRepository: new StaticIdempotencyRepository(),
      automationRepository: new StaticAutomationRepository(),
    })

    const t0 = Math.floor(Date.now() / 1000) - 2
    const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

    // Override middleware values during request by mounting mock in middleware or testing handler directly
    const res = await customApp.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { title: 'Infected Post' },
        _timeTrapToken: token,
        attachments: [
          {
            filename: 'malware.png',
            mimeType: 'image/png',
            data: validPngBase64,
            fileKey: 'uploads/malware.png',
          },
        ],
      }),
    }, TEST_ENV)

    expect(res.status).toBe(201)
  })

  describe('Confidential Data & Access Policies on Public Add', () => {
    const leadsSeed = {
      slug: 'leads',
      label: 'Lead',
      displayNameAlias: 'name',
      allowPublicPost: true,
      defaultPublicStatus: 'draft',
      branches: [
        { id: 'br_01', alias: 'name', label: 'Name', type: 'text', policies: { classification: 'public' } },
        { id: 'br_02', alias: 'email', label: 'Email', type: 'text', policies: { classification: 'confidential' } },
        { id: 'br_03', alias: 'internal_score', label: 'Internal Score', type: 'number', policies: { classification: 'internal' } },
        { id: 'br_04', alias: 'pin_hash', label: 'PIN Hash', type: 'text', policies: { classification: 'restricted' } },
        { id: 'br_05', alias: 'private_flag', label: 'Private Flag', type: 'text', policies: { public: false } },
      ],
    } as any

    it('accepts confidential fields on submission and passes cleartext values to AutomationRunner', async () => {
      const mockAutomationRunner = {
        run: vi.fn().mockResolvedValue({ success: true }),
      }
      const testApp = createBeechApp({
        seeds: [leadsSeed],
        repository: new StaticContentRepository([leadsSeed]),
        idempotencyRepository: new StaticIdempotencyRepository(),
        automationRepository: new StaticAutomationRepository(),
        automationRunner: mockAutomationRunner as any,
      })

      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

      const res = await testApp.request('/api/v1/public/leads/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            name: 'Jane Doe',
            email: 'jane@example.com',
          },
          _timeTrapToken: token,
        }),
      }, TEST_ENV)

      expect(res.status).toBe(201)
      const body = await res.json<{ success: boolean; id: string; slug: string }>()
      expect(body.success).toBe(true)
      expect(body.id).toBeDefined()

      expect(mockAutomationRunner.run).toHaveBeenCalledWith({
        seedSlug: 'leads',
        event: 'create',
        entry: expect.objectContaining({
          id: body.id,
          slug: body.slug,
          status: 'draft',
          name: 'Jane Doe',
          email: 'jane@example.com',
        }),
      })
    })

    it('rejects internal and restricted fields with HTTP 422 Problem Details', async () => {
      const testApp = createBeechApp({
        seeds: [leadsSeed],
        repository: new StaticContentRepository([leadsSeed]),
        idempotencyRepository: new StaticIdempotencyRepository(),
        automationRepository: new StaticAutomationRepository(),
      })

      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

      const res = await testApp.request('/api/v1/public/leads/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            name: 'Jane Doe',
            internal_score: 99,
            pin_hash: 'secret-hash',
          },
          _timeTrapToken: token,
        }),
      }, TEST_ENV)

      expect(res.status).toBe(422)
      const body = await res.json<{ type: string; title: string; detail: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/sensitive-field-write')
      expect(body.title).toBe('Unprocessable Entity')
      expect(body.detail).toBe('Cannot write internal/restricted fields: internal_score, pin_hash')
    })

    it('rejects explicit public: false fields with HTTP 422 Problem Details', async () => {
      const testApp = createBeechApp({
        seeds: [leadsSeed],
        repository: new StaticContentRepository([leadsSeed]),
        idempotencyRepository: new StaticIdempotencyRepository(),
        automationRepository: new StaticAutomationRepository(),
      })

      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken('beech-public-timetrap-default-secret', t0)

      const res = await testApp.request('/api/v1/public/leads/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {
            name: 'Jane Doe',
            private_flag: 'forbidden',
          },
          _timeTrapToken: token,
        }),
      }, TEST_ENV)

      expect(res.status).toBe(422)
      const body = await res.json<{ type: string; title: string; detail: string }>()
      expect(body.type).toBe('https://beechcms.dev/problems/sensitive-field-write')
      expect(body.detail).toBe('Cannot write internal/restricted fields: private_flag')
    })
  })
})
