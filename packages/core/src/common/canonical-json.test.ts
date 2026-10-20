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

  it('preserves own prototype-related keys in canonical order', () => {
    // Assignment invokes inherited prototype setters.
    const value: unknown = JSON.parse('{"prototype":3,"constructor":2,"a":1,"__proto__":{"polluted":true}}')

    const json = canonicalStringify(value)

    expect(json).toBe('{\n  "__proto__": {\n    "polluted": true\n  },\n  "a": 1,\n  "constructor": 2,\n  "prototype": 3\n}\n')
  })

  it.each([
    { items: [1, , 3] },
    { items: [1, undefined, 3] },
    { items: new Array(2) },
    { items: [1, ,] },
  ])('rejects missing array values at their indexed path: %j', (value) => {
    // Map skips sparse array slots.
    const index = value.items[0] === undefined ? 0 : 1
    const serialize = () => canonicalStringify(value)

    expect(serialize).toThrow(expect.objectContaining({
      name: 'CanonicalSerializationError',
      path: `items[${index}]`,
      found: 'undefined',
    }))
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
