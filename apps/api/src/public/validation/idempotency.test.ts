// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { buildRequestFingerprint, parseIdempotencyKey } from './idempotency'

describe('parseIdempotencyKey', () => {
  it('maps missing, blank and over-128-character headers to null and trims the rest', () => {
    const cases: Array<[string | undefined, string | null]> = [
      [undefined, null],
      ['', null],
      ['   ', null],
      ['k'.repeat(129), null],
      ['  retry-1  ', 'retry-1'],
      ['k'.repeat(128), 'k'.repeat(128)],
    ]

    const results = cases.map(([raw]) => parseIdempotencyKey(raw))

    expect(results).toEqual(cases.map(([, expected]) => expected))
  })
})

describe('buildRequestFingerprint', () => {
  const base = { seedSlug: 'public_json', statusValue: 'draft', slug: null }

  it('gives the same fingerprint to payloads that differ only in JSON object member order', async () => {
    const first = await buildRequestFingerprint({ ...base, data: { title: 'Prefs', settings: { a: 1, nested: { x: true, y: [1, 2] } } } })

    const retry = await buildRequestFingerprint({ ...base, data: { settings: { nested: { y: [1, 2], x: true }, a: 1 }, title: 'Prefs' } })

    expect(retry).toBe(first)
  })

  it('gives a different fingerprint when array order changes, because array order is data', async () => {
    const first = await buildRequestFingerprint({ ...base, data: { settings: { y: [1, 2] } } })

    const retry = await buildRequestFingerprint({ ...base, data: { settings: { y: [2, 1] } } })

    expect(retry).not.toBe(first)
  })
})
