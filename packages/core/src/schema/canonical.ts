// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/canonical
 * Deterministic serialization of a manifest. The bytes produced here are the input the schema
 * fingerprint hashes, so this format is a compatibility surface: changing it invalidates every
 * already-published client. Treat it as frozen.
 *
 * The serializer itself moved to `common/canonical-json.ts` in sprint 2 so the Worker-side
 * fingerprint can share it without importing this authoring-only module.
 */

import { canonicalStringify } from '../common/canonical-json.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/**
 * Thrown when a manifest carries a value that cannot survive a JSON round-trip.
 * Re-exported under its historical name: it is the SAME class object as
 * `CanonicalSerializationError`, so existing `instanceof` checks keep working.
 */
export { CanonicalSerializationError as ManifestSerializationError } from '../common/canonical-json.js'

/**
 * Serializes a manifest to its canonical form: seeds sorted by slug, keys sorted, two-space
 * indentation, trailing newline. Stable across authoring order and across key insertion order.
 */
export function toCanonicalJson(manifest: BeechSchemaManifest): string {
  const seeds = [...manifest.seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  return canonicalStringify({ version: manifest.version, seeds })
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
