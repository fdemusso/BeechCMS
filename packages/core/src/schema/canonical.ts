// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/canonical
 * Deterministic serialization of a manifest. The bytes produced here are the input a later schema
 * fingerprint hashes, so this format is a compatibility surface: changing it invalidates every
 * already-published client. Treat it as frozen.
 */

import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/** Thrown when a manifest carries a value that cannot survive a JSON round-trip. */
export class ManifestSerializationError extends Error {
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
    this.name = 'ManifestSerializationError'
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
  if (offence) throw new ManifestSerializationError(path, offence)

  if (value === null) return null
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      if (item === undefined) throw new ManifestSerializationError(`${path}[${index}]`, 'undefined')
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
 * Serializes a manifest to its canonical form: seeds sorted by slug, keys sorted, two-space
 * indentation, trailing newline. Stable across authoring order and across key insertion order.
 */
export function toCanonicalJson(manifest: BeechSchemaManifest): string {
  const seeds = [...manifest.seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  const canonical = canonicalize({ version: manifest.version, seeds }, '')
  return `${JSON.stringify(canonical, null, 2)}\n`
}

/** Parses canonical JSON back into a manifest, refusing an unknown format version. */
export function fromCanonicalJson(json: string): BeechSchemaManifest {
  const parsed = JSON.parse(json) as Partial<BeechSchemaManifest>
  if (parsed.version !== MANIFEST_VERSION) {
    throw new Error(
      `Unsupported manifest version ${String(parsed.version)}; this build understands ${MANIFEST_VERSION}.`,
    )
  }
  if (!Array.isArray(parsed.seeds)) throw new Error('Manifest is missing a `seeds` array.')
  return { version: MANIFEST_VERSION, seeds: parsed.seeds }
}
