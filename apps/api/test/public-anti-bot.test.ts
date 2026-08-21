// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateTimeTrapToken, type IAntivirusProvider, type INotificationService } from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { StaticAutomationRepository } from './mocks/static-automation.repository'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { TEST_SEEDS, TEST_ENV, TEST_PUBLIC_READ_KEY, TEST_PUBLIC_WRITE_KEY } from './fixtures'

describe('Public Form Security & Anti-Bot Defense', () => {
  let app: ReturnType<typeof createBeechApp>
  let repo: StaticContentRepository
  let mockAntivirus: IAntivirusProvider
  let mockNotificationService: INotificationService
  const SECRET = 'test-time-trap-secret-key-1234567890'

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()
    const automationRepo = new StaticAutomationRepository()

    mockAntivirus = {
      name: 'mock-av',
      scan: vi.fn().mockResolvedValue({ status: 'clean', provider: 'mock-av' }),
    }

    app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: repo,
      idempotencyRepository: idempotencyRepo,
      automationRepository: automationRepo,
    })
  })

  describe('GET /api/v1/public/timetrap/token', () => {
    it('returns a valid signed time-trap token', async () => {
      const res = await app.request('/api/v1/public/timetrap/token', {
        headers: { 'X-API-Key': TEST_PUBLIC_READ_KEY },
      }, { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET })

      expect(res.status).toBe(200)
      const body = await res.json<{ token: string; minDeltaSeconds: number }>()
      expect(body.token).toMatch(/^t0_\d+\.[0-9a-f]{64}$/)
      expect(body.minDeltaSeconds).toBe(1.5)
    })
  })

  describe('Origin Whitelist Validation', () => {
    it('rejects submissions from unauthorized origins when ALLOWED_ORIGINS is configured', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
          'Origin': 'https://malicious-site.com',
        },
        body: JSON.stringify({
          data: { title: 'Test Post', body: 'Content' },
        }),
      }, { ...TEST_ENV, ALLOWED_ORIGINS: 'https://mysite.com,https://app.mysite.com' })

      expect(res.status).toBe(403)
      const body = await res.json<{ type: string; title: string }>()
      expect(body.type).toContain('forbidden-origin')
      expect(body.title).toBe('Forbidden')
    })

    it('accepts submissions from authorized origins', async () => {
      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
          'Origin': 'https://mysite.com',
        },
        body: JSON.stringify({
          data: { title: 'Allowed Post', body: 'Content' },
        }),
      }, { ...TEST_ENV, ALLOWED_ORIGINS: 'https://mysite.com,https://app.mysite.com' })

      expect(res.status).toBe(201)
    })
  })

  describe('Camouflage Honeypot Detection', () => {
    const decoyFields = ['fax_number', 'website_url', 'middle_name', 'secondary_phone', '_gotcha', 'honeypot']

    for (const field of decoyFields) {
      it(`rejects bot submission when honeypot field '${field}' in body is filled`, async () => {
        const res = await app.request('/api/v1/public/posts/add', {
          method: 'POST',
          headers: {
            'X-API-Key': TEST_PUBLIC_WRITE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Spam Post', body: 'Spam' },
            [field]: 'I am a bot',
          }),
        }, TEST_ENV)

        expect(res.status).toBe(422)
        const body = await res.json<{ type: string }>()
        expect(body.type).toContain('honeypot-triggered')
      })

      it(`rejects bot submission when honeypot field '${field}' inside data is filled`, async () => {
        const res = await app.request('/api/v1/public/posts/add', {
          method: 'POST',
          headers: {
            'X-API-Key': TEST_PUBLIC_WRITE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Spam Post', body: 'Spam', [field]: 'bot-payload' },
          }),
        }, TEST_ENV)

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
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
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
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
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
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
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
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
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
      // PDF header (%PDF-) declared as image/png
      const fakePngBase64 = btoa('%PDF-1.5 fake content')

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Spoofed File Post' },
          attachments: [
            {
              filename: 'evil.png',
              mimeType: 'image/png',
              data: fakePngBase64,
            },
          ],
        }),
      }, TEST_ENV)

      expect(res.status).toBe(400)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('invalid-file-signature')
      expect(body.detail).toContain('Signature mismatch')
    })

    it('accepts attachment with authentic PNG magic bytes', async () => {
      // Real PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D])
      let binaryStr = ''
      for (let i = 0; i < pngBytes.length; i++) binaryStr += String.fromCharCode(pngBytes[i])
      const validPngBase64 = btoa(binaryStr)

      const res = await app.request('/api/v1/public/posts/add', {
        method: 'POST',
        headers: {
          'X-API-Key': TEST_PUBLIC_WRITE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: { title: 'Valid Image Post' },
          attachments: [
            {
              filename: 'valid.png',
              mimeType: 'image/png',
              data: validPngBase64,
            },
          ],
        }),
      }, TEST_ENV)

      expect(res.status).toBe(201)
    })
  })
})
