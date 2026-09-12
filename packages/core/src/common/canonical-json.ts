// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module common/canonical-json
 * Deterministic JSON serialization, shared by two callers that must never disagree:
 * the manifest writer (`schema/canonical.ts`, authoring-side) and the schema fingerprint
 * (`engine/schema-fingerprint.ts`, runtime-side).
 *
 * Moved here in sprint 2 because the fingerprint runs inside the Worker and `schema/` is the one
 * module the Worker must never import. The BYTES ARE FROZEN — sprint 1 declared this format a
 * compatibility surface, and a published client's fingerprint is only comparable as long as it
 * stays byte-stable. Changing key ordering, indentation or the trailing newline invalidates every
 * already-published client and requires a `SCHEMA_FINGERPRINT_VERSION` bump.
 */

/** Thrown when a value cannot survive a JSON round-trip. */
export class CanonicalSerializationError extends Error {
  constructor(
    /** Dotted path to the offending value, e.g. `seeds[0].branches[2].validate`. */
    readonly path: string,
    /** What was found there, e.g. `function`. */
    readonly found: string,
  ) {
    super(
      `Manifest value at '${path}' is a ${found}, which cannot be persisted. ` +
      `A manifest holds serializable JSON only — no callbacks, class instances, Date, Map, Set or RegExp.`,
    )
    this.name = 'CanonicalSerializationError'
  }
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

function describe(value: unknown): string | null {
  if (value === null) return null
  const type = typeof value
  if (type === 'function') return 'function'
  if (type === 'symbol') return 'symbol'
  if (type === 'bigint') return 'bigint'
  if (type === 'undefined') return 'undefined'
  if (type === 'number' && !Number.isFinite(value as number)) return 'non-finite number'
  if (type !== 'object') return null
  if (Array.isArray(value)) return null
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return (value as object).constructor?.name ?? 'class instance'
  return null
}

/**
 * Canonicalizes one value: object keys sorted lexicographically, `undefined` properties dropped,
 * array ORDER preserved (branch order is the physical column order — it is data, not formatting).
 */
function canonicalize(value: unknown, path: string): Json {
  const offence = describe(value)
  if (offence) throw new CanonicalSerializationError(path, offence)

  if (value === null) return null
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item === undefined) throw new CanonicalSerializationError(`${path}[${index}]`, 'undefined')
      return canonicalize(item, `${path}[${index}]`)
    })
  }
  if (typeof value === 'object') {
    const out: { [key: string]: Json } = {}
    for (const key of Object.keys(value as object).sort()) {
      const child = (value as Record<string, unknown>)[key]
      if (child === undefined) continue
      out[key] = canonicalize(child, path ? `${path}.${key}` : key)
    }
    return out
  }
  return value as Json
}

/**
 * Serializes any value to its canonical form: keys sorted, two-space indentation, trailing newline.
 * Stable across key insertion order and across authoring order.
 */
export function canonicalStringify(value: unknown): string {
  return `${JSON.stringify(canonicalize(value, ''), null, 2)}\n`
}
