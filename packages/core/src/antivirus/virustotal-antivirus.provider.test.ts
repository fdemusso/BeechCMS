// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VirusTotalAntivirusProvider } from './virustotal-antivirus.provider.js'
import { NoopAntivirusProvider } from './noop-antivirus.provider.js'

describe('Antivirus Providers', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('NoopAntivirusProvider', () => {
    it('returns skipped status', async () => {
      const provider = new NoopAntivirusProvider()
      expect(provider.name).toBe('noop')
      const result = await provider.scan(new Uint8Array([1, 2, 3]), 'test.txt')
      expect(result.status).toBe('skipped')
      expect(result.provider).toBe('noop')
    })
  })

  describe('VirusTotalAntivirusProvider', () => {
    it('returns skipped if no API key is provided', async () => {
      const provider = new VirusTotalAntivirusProvider()
      expect(provider.name).toBe('virustotal')
      const result = await provider.scan(new Uint8Array([1, 2, 3]), 'test.pdf')
      expect(result.status).toBe('skipped')
      expect(result.details).toContain('API key not configured')
    })

    it('returns clean when VirusTotal hash lookup reports 0 malicious stats', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 0,
                suspicious: 0,
                undetected: 60,
                harmless: 10,
              },
            },
          },
        }),
      } as Response)

      const provider = new VirusTotalAntivirusProvider('test-api-key')
      const result = await provider.scan(new Uint8Array([1, 2, 3]), 'clean.pdf')
      expect(result.status).toBe('clean')
      expect(result.provider).toBe('virustotal')
    })

    it('returns infected when VirusTotal hash lookup reports malicious engines', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          data: {
            attributes: {
              last_analysis_stats: {
                malicious: 5,
                suspicious: 2,
                undetected: 50,
              },
            },
          },
        }),
      } as Response)

      const provider = new VirusTotalAntivirusProvider('test-api-key')
      const result = await provider.scan(new Uint8Array([1, 2, 3]), 'virus.exe')
      expect(result.status).toBe('infected')
      expect(result.details).toContain('Detected by 7 security engines')
    })

    it('uploads file for scanning when hash is not found (404)', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          status: 404,
          ok: false,
        } as Response)
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
        } as Response)

      const provider = new VirusTotalAntivirusProvider('test-api-key')
      const result = await provider.scan(new Uint8Array([1, 2, 3]), 'newfile.pdf')
      expect(result.status).toBe('clean')
      expect(result.details).toContain('Queued for background analysis')
    })

    it('returns error when fetch throws', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network offline'))

      const provider = new VirusTotalAntivirusProvider('test-api-key')
      const result = await provider.scan(new Uint8Array([1, 2, 3]), 'test.pdf')
      expect(result.status).toBe('error')
      expect(result.details).toBe('Network offline')
    })
  })
})
