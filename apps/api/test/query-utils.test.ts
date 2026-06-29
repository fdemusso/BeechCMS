// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import {
  cleanStr,
  parsePositiveInt,
  parseQueryFilters,
  safeParseJson,
} from '../src/shared/utils/query-utils'

describe('shared/query-utils', () => {
  it('cleanStr e parsePositiveInt gestiscono fallback correttamente', () => {
    expect(cleanStr('  hello  ')).toBe('hello')
    expect(cleanStr('   ')).toBeNull()
    expect(parsePositiveInt('12', 1)).toBe(12)
    expect(parsePositiveInt('0', 5)).toBe(5)
    expect(parsePositiveInt(undefined, 7)).toBe(7)
  })

  it('safeParseJson ritorna oggetto vuoto con JSON invalido', () => {
    expect(safeParseJson('{"ok":1}')).toEqual({ ok: 1 })
    expect(safeParseJson('invalid-json')).toEqual({})
    expect(safeParseJson('["a"]')).toEqual({})
  })

  it('parseQueryFilters parsea gruppi validi e ignora input malformato', () => {
    const malformed = parseQueryFilters('{not-json')
    expect(malformed).toEqual([])

    const filters = parseQueryFilters(
      JSON.stringify({
        group1: {
          columnId: 'title',
          type: 'text',
          conditions: [{ op: 'contains', value: 'Beech' }],
        },
      })
    )

    expect(filters).toHaveLength(1)
    expect(filters[0].columnId).toBe('title')
    expect(filters[0].conditions[0].op).toBe('contains')
  })
})
