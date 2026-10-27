// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { exportQuerySchema, importRequestSchema } from './transfer.schema'

describe('importRequestSchema', () => {
  it.each([[null], [[]], [5], [{}], [{ objectKey: 7, format: null }]])(
    'accepts %j, because every refusal belongs to the handler and its fixed order',
    (body) => {
      const result = importRequestSchema.safeParse(body)

      expect(result.success).toBe(true)
    },
  )
})

describe('exportQuerySchema', () => {
  it('accepts an empty query and keeps the three names it types', () => {
    const result = exportQuerySchema.safeParse({ format: '', search: 'a', filters: '[]', extra: 'x' })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({ format: '', search: 'a', filters: '[]' })
  })
})
