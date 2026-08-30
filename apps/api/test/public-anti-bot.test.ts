// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateTimeTrapToken, type IAntivirusProvider, type INotificationService } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { StaticAutomationRepository } from './mocks/static-automation.repository'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { StaticTimeTrapTokenRepository } from './mocks/static-time-trap-token.repository'
import { TEST_SEEDS, TEST_ENV, TEST_PUBLIC_WRITE_KEY } from './fixtures'

describe('Public Form Security & Anti-Bot Defense', () => {
  let app: ReturnType<typeof createBeechApp>
  let repo: StaticContentRepository
  let timeTrapRepo: StaticTimeTrapTokenRepository
  let mockAntivirus: IAntivirusProvider
  let mockNotificationService: INotificationService
  const SECRET = 'test-time-trap-secret-key-1234567890'

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()
    const automationRepo = new StaticAutomationRepository()
    timeTrapRepo = new StaticTimeTrapTokenRepository()

    mockAntivirus = {
      name: 'mock-av',
      scan: vi.fn().mockResolvedValue({ status: 'clean', provider: 'mock-av' }),
    }

    app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: repo,
      idempotencyRepository: idempotencyRepo,
      automationRepository: automationRepo,
      timeTrapTokenRepository: timeTrapRepo,
    })
  })

  describe('Zero-Secret Endpoints', () => {
    it('GET /api/v1/public/timetrap/token issues token without X-API-Key', async () => {
      const res = await app.request('/api/v1/public/timetrap/token', {}, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(200)
      const body = await res.json<{ token: string; minDeltaSeconds: number }>()
      expect(body.token).toMatch(/^t0_\d+\.[0-9a-f]{64}$/)
      expect(body.minDeltaSeconds).toBe(1.5)
    })

    it('POST /api/v1/public/:seed/add executes in Zero-Secret mode without X-API-Key', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Zero Secret Post', body: 'No API key needed' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(201)
      const body = await res.json<{ success: boolean; id: string; slug: string }>()
      expect(body.success).toBe(true)
      expect(body.id).toBeDefined()
    })
  })

  describe('Single-Use Token Replay Prevention', () => {
    it('rejects submissions missing a Time-Trap token with HTTP 422', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'No Token Post', body: 'Missing token' },
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(422)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('time-trap-missing')
    })

    it('rejects replayed Time-Trap tokens on second submission with HTTP 422', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const firstRes = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'First Submission', body: 'Original' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(firstRes.status).toBe(201)

      const secondRes = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Replay Submission', body: 'Replayed' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(secondRes.status).toBe(422)
      const body = await secondRes.json<{ type: string; detail: string }>()
      expect(body.type).toContain('time-trap-replayed')
    })
  })

  describe('Backend-Driven Status Enforcement', () => {
    it('disregards client-supplied status and defaults to published', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Status Test Post' },
          status: 'draft',
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(201)
      const body = await res.json<{ id: string }>()
      const entry = await repo.findById(TEST_SEEDS[0], body.id)
      expect(entry?.status).toBe('published')
    })
  })

  describe('Origin Whitelist Validation', () => {
    it('rejects submissions from unauthorized origins when ALLOWED_ORIGINS is configured', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://malicious-site.com',
        },
        body: JSON.stringify({
          data: { title: 'Test Post', body: 'Content' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET, ALLOWED_ORIGINS: 'https://mysite.com,https://app.mysite.com' })

      expect(res.status).toBe(403)
      const body = await res.json<{ type: string; title: string }>()
      expect(body.type).toContain('forbidden-origin')
      expect(body.title).toBe('Forbidden')
    })

    it('accepts submissions from authorized origins', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://mysite.com',
        },
        body: JSON.stringify({
          data: { title: 'Allowed Post', body: 'Content' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET, ALLOWED_ORIGINS: 'https://mysite.com,https://app.mysite.com' })

      expect(res.status).toBe(201)
    })
  })

  describe('Camouflage Honeypot Detection', () => {
    const decoyFields = ['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot']

    for (const field of decoyFields) {
      it(`rejects bot submission when honeypot field '${field}' in body is filled`, async () => {
        const t0 = Math.floor(Date.now() / 1000) - 2
        const token = await generateTimeTrapToken(SECRET, t0)

        const res = await app.request('/api/v1/public/posts/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Spam Post', body: 'Spam' },
            [field]: 'I am a bot',
            _timeTrapToken: token,
          }),
        }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

        expect(res.status).toBe(422)
        const body = await res.json<{ type: string }>()
        expect(body.type).toContain('honeypot-triggered')
      })

      it(`rejects bot submission when honeypot field '${field}' inside data is filled`, async () => {
        const t0 = Math.floor(Date.now() / 1000) - 2
        const token = await generateTimeTrapToken(SECRET, t0)

        const res = await app.request('/api/v1/public/posts/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Spam Post', body: 'Spam', [field]: 'bot-payload' },
            _timeTrapToken: token,
          }),
        }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

        expect(res.status).toBe(422)
        const body = await res.json<{ type: string }>()
        expect(body.type).toContain('honeypot-triggered')
      })
    }
  })

  describe('Time Trap Verification', () => {
    it('accepts submission with valid time-trap token having elapsed time >= 1.5s', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2 // 2 seconds ago
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Timely Post', body: 'Valid timing' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(201)
    })

    it('accepts time-trap token provided in x-time-trap header', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 3
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-time-trap': token,
        },
        body: JSON.stringify({
          data: { title: 'Header Timed Post', body: 'Valid header token' },
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(201)
    })

    it('rejects submissions with elapsed time < 1.5s (instant bot submission)', async () => {
      const t0 = Math.floor(Date.now() / 1000) // 0s ago
      const token = await generateTimeTrapToken(SECRET, t0)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Fast Post', body: 'Submitted too quickly' },
          _timeTrapToken: token,
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(422)
      const body = await res.json<{ type: string }>()
      expect(body.type).toContain('time-trap-violation')
    })

    it('rejects forged or invalid time-trap tokens', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Forged Post', body: 'Fake token' },
          _timeTrapToken: 't0_123456789.badsignaturedeadbeef',
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(422)
      const body = await res.json<{ type: string }>()
      expect(body.type).toContain('time-trap-violation')
    })
  })

  describe('Magic Bytes Attachment Verification', () => {
    it('rejects attachment whose binary signature does not match declared MIME', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      // PDF header (%PDF-) declared as image/png
      const fakePngBase64 = btoa('%PDF-1.5 fake content')

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Spoofed File Post' },
          _timeTrapToken: token,
          attachments: [
            {
              filename: 'evil.png',
              mimeType: 'image/png',
              data: fakePngBase64,
            },
          ],
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(400)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('invalid-file-signature')
      expect(body.detail).toContain('Signature mismatch')
    })

    it('accepts attachment with authentic PNG magic bytes', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      // Real PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
      let binaryStr = ''
      for (let i = 0; i < pngBytes.length; i++) binaryStr += String.fromCharCode(pngBytes[i])
      const validPngBase64 = btoa(binaryStr)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Valid Image Post' },
          _timeTrapToken: token,
          attachments: [
            {
              filename: 'valid.png',
              mimeType: 'image/png',
              data: validPngBase64,
            },
          ],
        }),
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(201)
    })
  })
})
