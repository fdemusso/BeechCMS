// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { canonicalStringify, CanonicalSerializationError } from './canonical-json.js'

describe('canonicalStringify', () => {
  it('sorts object keys lexicographically regardless of insertion order', () => {
    const insertedZFirst = { z: 1, a: 2, m: 3 }
    const insertedAFirst = { a: 2, m: 3, z: 1 }

    expect(canonicalStringify(insertedZFirst)).toBe(canonicalStringify(insertedAFirst))
  })

  it('preserves array order, because branch order is the physical column order', () => {
    const value = { items: ['c', 'a', 'b'] }

    const json = canonicalStringify(value)

    expect(JSON.parse(json).items).toEqual(['c', 'a', 'b'])
  })

  it('drops undefined properties and ends the output with a newline', () => {
    const json = canonicalStringify({ kept: 'yes', dropped: undefined })

    expect(json).not.toContain('dropped')
    expect(json.endsWith('\n')).toBe(true)
  })

  it('a function anywhere in the tree throws CanonicalSerializationError naming its dotted path', () => {
    const value = { seeds: [{ branches: [{ validate: () => true }] }] }

    let error: unknown
    try {
      canonicalStringify(value)
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(CanonicalSerializationError)
    expect((error as CanonicalSerializationError).path).toBe('seeds[0].branches[0].validate')
    expect((error as CanonicalSerializationError).found).toBe('function')
  })

  it('a Date, a Map and a RegExp each throw CanonicalSerializationError', () => {
    const offendingValues = [new Date(), new Map(), /x/]

    for (const offendingValue of offendingValues) {
      expect(() => canonicalStringify({ weird: offendingValue })).toThrow(CanonicalSerializationError)
    }
  })
})
