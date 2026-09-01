// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  generateTimeTrapToken,
  SUPPORTED_FILE_TYPES,
  type FileTypeDefinition,
} from '@beechcms/core'
import { createBeechApp } from '../src/factory'
import { StaticAutomationRepository } from './mocks/static-automation.repository'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { StaticTimeTrapTokenRepository } from './mocks/static-time-trap-token.repository'
import { TEST_SEEDS, TEST_ENV } from './fixtures'
import {
  getSampleBufferForExtension,
  bufferToBase64,
} from './fixtures/file-samples'

const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'files')
const SECRET = 'test-time-trap-secret-e2e-file-signatures'

describe('End-to-End File Signatures & Ingestion Pipeline', () => {
  let app: ReturnType<typeof createBeechApp>
  let repo: StaticContentRepository
  let timeTrapRepo: StaticTimeTrapTokenRepository

  beforeAll(() => {
    // Write actual physical files to disk in fixtures/files/ for all supported extensions
    if (!fs.existsSync(FIXTURES_DIR)) {
      fs.mkdirSync(FIXTURES_DIR, { recursive: true })
    }

    for (const [ext] of Object.entries(SUPPORTED_FILE_TYPES)) {
      const buffer = getSampleBufferForExtension(ext)
      const filePath = path.join(FIXTURES_DIR, `sample.${ext}`)
      fs.writeFileSync(filePath, buffer)
    }
  })

  afterAll(() => {
    // Clean up fixture files
    if (fs.existsSync(FIXTURES_DIR)) {
      fs.rmSync(FIXTURES_DIR, { recursive: true, force: true })
    }
  })

  beforeEach(() => {
    repo = new StaticContentRepository(TEST_SEEDS)
    const idempotencyRepo = new StaticIdempotencyRepository()
    const automationRepo = new StaticAutomationRepository()
    timeTrapRepo = new StaticTimeTrapTokenRepository()

    app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: repo,
      idempotencyRepository: idempotencyRepo,
      automationRepository: automationRepo,
      timeTrapTokenRepository: timeTrapRepo,
    })
  })

  describe('Real Physical Fixtures on Disk', () => {
    it('verifies all physical fixture files exist on disk with valid non-zero content', () => {
      const extensions = Object.keys(SUPPORTED_FILE_TYPES)
      expect(extensions.length).toBeGreaterThanOrEqual(20)

      for (const ext of extensions) {
        const filePath = path.join(FIXTURES_DIR, `sample.${ext}`)
        expect(fs.existsSync(filePath), `Physical file for .${ext} must exist`).toBe(true)
        const stats = fs.statSync(filePath)
        expect(stats.size).toBeGreaterThan(0)
      }
    })
  })

  describe('End-to-End Ingestion for Every Supported File Type', () => {
    const supportedList = Object.entries(SUPPORTED_FILE_TYPES)

    it.each(supportedList)(
      'accepts authentic file for .%s (%s) and returns 201 Created',
      async (ext: string, def: FileTypeDefinition) => {
        const t0 = Math.floor(Date.now() / 1000) - 2
        const token = await generateTimeTrapToken(SECRET, t0)

        // Read the actual physical file from disk
        const filePath = path.join(FIXTURES_DIR, `sample.${ext}`)
        const fileBytes = new Uint8Array(fs.readFileSync(filePath))
        const base64Data = bufferToBase64(fileBytes)

        const res = await app.request(
          '/api/v1/public/generic_submissions/add',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              data: {
                title: `Submission with .${ext} attachment`,
                attachment: `https://cdn.example.com/uploads/sample.${ext}`,
              },
              _timeTrapToken: token,
              attachments: [
                {
                  filename: `sample.${ext}`,
                  mimeType: def.primaryMime,
                  data: base64Data,
                },
              ],
            }),
          },
          { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET }
        )

        expect(res.status).toBe(201)
        const body = await res.json<{ success: boolean; id: string }>()
        expect(body.success).toBe(true)
        expect(body.id).toBeDefined()
      }
    )
  })

  describe('Security Rejection & Signature Mismatches', () => {
    it('rejects an executable script disguised with .pdf extension and application/pdf MIME', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const evilScriptBytes = new TextEncoder().encode('#!/bin/bash\nrm -rf /')
      const evilBase64 = bufferToBase64(evilScriptBytes)

      const res = await app.request(
        '/api/v1/public/generic_submissions/add',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Disguised Malicious Script' },
            _timeTrapToken: token,
            attachments: [
              {
                filename: 'invoice.pdf',
                mimeType: 'application/pdf',
                data: evilBase64,
              },
            ],
          }),
        },
        { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET }
      )

      expect(res.status).toBe(400)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('invalid-file-signature')
      expect(body.detail).toContain('Unrecognized file signature for declared MIME application/pdf')
    })

    it('rejects a JPEG binary image declared as image/png (signature mismatch)', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      // Real JPEG sample declared as image/png
      const jpegBuffer = getSampleBufferForExtension('jpg')
      const jpegBase64 = bufferToBase64(jpegBuffer)

      const res = await app.request(
        '/api/v1/public/generic_submissions/add',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Mismatched Image Type' },
            _timeTrapToken: token,
            attachments: [
              {
                filename: 'photo.png',
                mimeType: 'image/png',
                data: jpegBase64,
              },
            ],
          }),
        },
        { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET }
      )

      expect(res.status).toBe(400)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('invalid-file-signature')
      expect(body.detail).toContain('Signature mismatch: file is JPG but declared as image/png')
    })

    it('rejects SVG upload even if sent as attachment', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const svgBytes = new TextEncoder().encode('<svg><script>alert(1)</script></svg>')
      const svgBase64 = bufferToBase64(svgBytes)

      const res = await app.request(
        '/api/v1/public/generic_submissions/add',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'XSS Vector SVG' },
            _timeTrapToken: token,
            attachments: [
              {
                filename: 'vector.svg',
                mimeType: 'image/svg+xml',
                data: svgBase64,
              },
            ],
          }),
        },
        { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET }
      )

      expect(res.status).toBe(400)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('invalid-file-signature')
      expect(body.detail).toContain('blocked for security reasons')
    })

    it('rejects 1-byte truncated attachment buffer', async () => {
      const t0 = Math.floor(Date.now() / 1000) - 2
      const token = await generateTimeTrapToken(SECRET, t0)

      const truncatedBytes = new Uint8Array([0x89])
      const truncatedBase64 = bufferToBase64(truncatedBytes)

      const res = await app.request(
        '/api/v1/public/generic_submissions/add',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            data: { title: 'Truncated Buffer' },
            _timeTrapToken: token,
            attachments: [
              {
                filename: 'broken.png',
                mimeType: 'image/png',
                data: truncatedBase64,
              },
            ],
          }),
        },
        { ...TEST_ENV, PUBLIC_TIME_TRAP_SECRET: SECRET }
      )

      expect(res.status).toBe(400)
      const body = await res.json<{ type: string; detail: string }>()
      expect(body.type).toContain('invalid-file-signature')
      expect(body.detail).toContain('File buffer too small for signature inspection')
    })
  })
})
