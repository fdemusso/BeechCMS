// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { confirmRequestSchema, firstIssueMessage, presignRequestSchema } from './upload.schema'

const validPresign = { filename: 'photo.png', mimeType: 'image/png', sizeBytes: 1024 }

function presignMessage(body: unknown): string | null {
  const result = presignRequestSchema.safeParse(body)
  return result.success ? null : firstIssueMessage(result.error)
}

function confirmMessage(body: unknown): string | null {
  const result = confirmRequestSchema.safeParse(body)
  return result.success ? null : firstIssueMessage(result.error)
}

describe('presignRequestSchema', () => {
  it('accepts a body with the three required fields and no purpose', () => {
    const result = presignRequestSchema.safeParse(validPresign)

    expect(result.success).toBe(true)
  })

  it('accepts purpose import', () => {
    const result = presignRequestSchema.safeParse({ ...validPresign, purpose: 'import' })

    expect(result.success).toBe(true)
  })

  it('names the rule each malformed field breaks', () => {
    const cases: Array<[unknown, string]> = [
      [{ ...validPresign, purpose: 'media' }, 'Invalid purpose'],
      [{ ...validPresign, purpose: null }, 'Invalid purpose'],
      [{ ...validPresign, filename: undefined }, 'filename is required'],
      [{ ...validPresign, filename: '   ' }, 'filename is required'],
      [{ ...validPresign, filename: 7 }, 'filename is required'],
      [{ ...validPresign, mimeType: undefined }, 'mimeType is required'],
      [{ ...validPresign, mimeType: '' }, 'mimeType is required'],
      [{ ...validPresign, sizeBytes: undefined }, 'sizeBytes must be a positive number'],
      [{ ...validPresign, sizeBytes: 0 }, 'sizeBytes must be a positive number'],
      [{ ...validPresign, sizeBytes: -5 }, 'sizeBytes must be a positive number'],
      [{ ...validPresign, sizeBytes: '1024' }, 'sizeBytes must be a positive number'],
      // JSON.parse('1e999') is Infinity: the old handler refused it with Number.isFinite.
      [{ ...validPresign, sizeBytes: JSON.parse('1e999') }, 'sizeBytes must be a positive number'],
    ]

    for (const [body, message] of cases) {
      expect(presignMessage(body)).toBe(message)
    }
  })

  it('reports the first broken rule in the order the handler used to check them', () => {
    const everythingWrong = { purpose: 'media', filename: '', mimeType: '', sizeBytes: 0 }
    const withoutPurpose = { filename: '', mimeType: '', sizeBytes: 0 }
    const sizeAndMime = { filename: 'a.png', mimeType: '', sizeBytes: 0 }

    expect(presignMessage(everythingWrong)).toBe('Invalid purpose')
    expect(presignMessage(withoutPurpose)).toBe('filename is required')
    expect(presignMessage(sizeAndMime)).toBe('mimeType is required')
  })

  it('answers a body that is not an object with the first required field', () => {
    // A string, a number or an array used to be destructured into undefined fields.
    const bodies: unknown[] = ['text', 5, [], [validPresign]]

    for (const body of bodies) {
      expect(presignMessage(body)).toBe('filename is required')
    }
  })

  it('refuses null, which the old destructuring turned into a 500', () => {
    const message = presignMessage(null)

    expect(message).toBe('filename is required')
  })

  it('keeps the filename as sent: trimming it would change the object key', () => {
    const result = presignRequestSchema.safeParse({ ...validPresign, filename: ' photo.png ' })

    expect(result).toMatchObject({ success: true, data: { filename: ' photo.png ' } })
  })
})

describe('confirmRequestSchema', () => {
  it('accepts a body with a key', () => {
    const result = confirmRequestSchema.safeParse({ key: '1700000000000-abc123-photo.png' })

    expect(result.success).toBe(true)
  })

  it('refuses a missing, blank or non-string key with key is required', () => {
    const bodies: unknown[] = [{}, { key: '' }, { key: '  ' }, { key: 3 }, { key: null }, null, 'text', []]

    for (const body of bodies) {
      expect(confirmMessage(body)).toBe('key is required')
    }
  })
})
