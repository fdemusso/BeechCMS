// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  verifyClientMagicBytes,
  fileToAttachment,
} from '../core/file-uploader.js'

describe('file-uploader', () => {
  it('validates PDF magic bytes (%PDF-)', () => {
    // 0x25, 0x50, 0x44, 0x46 = %PDF
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35])
    const valid = verifyClientMagicBytes(pdfBytes, 'application/pdf')
    expect(valid.valid).toBe(true)

    const mismatch = verifyClientMagicBytes(pdfBytes, 'image/png')
    expect(mismatch.valid).toBe(false)
  })

  it('validates PNG magic bytes', () => {
    // 0x89, 0x50, 0x4E, 0x47 = .PNG
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    expect(verifyClientMagicBytes(pngBytes, 'image/png').valid).toBe(true)
    expect(verifyClientMagicBytes(pngBytes, 'application/pdf').valid).toBe(false)
  })

  it('validates JPEG magic bytes', () => {
    // 0xFF, 0xD8, 0xFF
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
    expect(verifyClientMagicBytes(jpegBytes, 'image/jpeg').valid).toBe(true)
    expect(verifyClientMagicBytes(jpegBytes, 'image/jpg').valid).toBe(true)
    expect(verifyClientMagicBytes(jpegBytes, 'image/png').valid).toBe(false)
  })

  it('validates GIF magic bytes', () => {
    // 0x47, 0x49, 0x46, 0x38 = GIF8
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    expect(verifyClientMagicBytes(gifBytes, 'image/gif').valid).toBe(true)
    expect(verifyClientMagicBytes(gifBytes, 'image/jpeg').valid).toBe(false)
  })

  it('validates WebP magic bytes', () => {
    // RIFF....WEBP
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // size
      0x57, 0x45, 0x42, 0x50, // WEBP
    ])
    expect(verifyClientMagicBytes(webpBytes, 'image/webp').valid).toBe(true)
    expect(verifyClientMagicBytes(webpBytes, 'image/png').valid).toBe(false)
  })

  it('rejects files with buffer too small or unknown format', () => {
    const tiny = new Uint8Array([0x01, 0x02])
    expect(verifyClientMagicBytes(tiny, 'image/png').valid).toBe(false)

    const random = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    expect(verifyClientMagicBytes(random, 'application/pdf').valid).toBe(false)
  })

  it('converts valid file to base64 attachment', async () => {
    // Create a mock PDF File
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    const file = new File([content], 'sample.pdf', { type: 'application/pdf' })

    const result = await fileToAttachment(file)
    expect(result.error).toBeUndefined()
    expect(result.attachment.filename).toBe('sample.pdf')
    expect(result.attachment.mimeType).toBe('application/pdf')
    expect(result.attachment.data).toBe(btoa(String.fromCharCode(...content)))
  })
})
