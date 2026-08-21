// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { verifyMagicBytes } from './magic-bytes.js'

describe('verifyMagicBytes', () => {
  it('validates PDF signature (%PDF-)', () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x35])
    const res = verifyMagicBytes(pdfBytes, 'application/pdf')
    expect(res.valid).toBe(true)
    expect(res.detectedMime).toBe('application/pdf')
  })

  it('rejects PDF file declared as image/png', () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D])
    const res = verifyMagicBytes(pdfBytes, 'image/png')
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Signature mismatch')
  })

  it('validates PNG signature', () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00])
    const res = verifyMagicBytes(pngBytes, 'image/png')
    expect(res.valid).toBe(true)
    expect(res.detectedMime).toBe('image/png')
  })

  it('validates JPEG signature', () => {
    const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
    const res = verifyMagicBytes(jpegBytes, 'image/jpeg')
    expect(res.valid).toBe(true)
    expect(res.detectedMime).toBe('image/jpeg')
  })

  it('validates GIF signature (GIF89a)', () => {
    const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    const res = verifyMagicBytes(gifBytes, 'image/gif')
    expect(res.valid).toBe(true)
    expect(res.detectedMime).toBe('image/gif')
  })

  it('validates WebP signature', () => {
    // RIFF....WEBP
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46,
      0x20, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x20
    ])
    const res = verifyMagicBytes(webpBytes, 'image/webp')
    expect(res.valid).toBe(true)
    expect(res.detectedMime).toBe('image/webp')
  })

  it('allows text/plain and text/csv without binary signature check', () => {
    const textBytes = new TextEncoder().encode('Hello, world! This is a test file.')
    const res = verifyMagicBytes(textBytes, 'text/plain')
    expect(res.valid).toBe(true)

    const csvBytes = new TextEncoder().encode('id,name,email\n1,Alice,alice@example.com')
    const csvRes = verifyMagicBytes(csvBytes, 'text/csv')
    expect(csvRes.valid).toBe(true)
  })

  it('rejects buffers smaller than 4 bytes', () => {
    const smallBuffer = new Uint8Array([0x01, 0x02])
    const res = verifyMagicBytes(smallBuffer, 'image/png')
    expect(res.valid).toBe(false)
    expect(res.error).toBe('File buffer too small for signature inspection')
  })

  it('rejects unknown binary signatures for image types', () => {
    const randomBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05])
    const res = verifyMagicBytes(randomBytes, 'image/png')
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Unrecognized file signature')
  })
})
