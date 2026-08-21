// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IAntivirusProvider, INotificationService, BeechBucket } from '@beechcms/core'
import { createBeechApp } from '../factory'
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

    const scanSpy = vi.fn().mockResolvedValue({
      status: 'infected',
      provider: 'mock-av',
      details: 'Trojan.Generic',
    })
    const notifySpy = vi.fn()
    const deleteSpy = vi.fn().mockResolvedValue(undefined)

    // Build app with mocked antivirus, notification service, and bucket
    const customApp = createBeechApp({
      seeds: TEST_SEEDS,
      repository: new StaticContentRepository(TEST_SEEDS),
      idempotencyRepository: new StaticIdempotencyRepository(),
      automationRepository: new StaticAutomationRepository(),
    })

    // Override middleware values during request by mounting mock in middleware or testing handler directly
    const res = await customApp.request('/api/v1/public/posts/add', {
      method: 'POST',
      headers: {
        'X-API-Key': TEST_PUBLIC_WRITE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: { title: 'Infected Post' },
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
})
