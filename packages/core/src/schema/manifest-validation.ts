// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/manifest-validation
 * Whole-manifest validation. Reuses the engine's `validateSeedDefinitions` rather than
 * reimplementing it: a manifest that passes here is a candidate set the API would also accept.
 */

import { validateSeedDefinitions } from '../engine/seed-validation.js'
import type { SeedValidationIssue } from '../engine/seed-validation.js'
import { MANIFEST_VERSION } from './manifest.types.js'
import { toCanonicalJson, ManifestSerializationError } from './canonical.js'
import { manifestToSeeds } from './manifest-seeds.js'
import type { BeechSchemaManifest } from './manifest.types.js'

/**
 * Validates a manifest end to end:
 *  1. format version is one this build understands;
 *  2. every value survives canonical serialization (no callbacks or executable code persisted);
 *  3. the derived `Seed[]` passes the engine's whole-set validation — including cross-seed relation
 *     targets, which is exactly why this is a manifest-level and not a seed-level function.
 *
 * Returns issues; never throws. A caller decides whether a non-fatal issue blocks.
 */
export function validateManifest(manifest: BeechSchemaManifest): SeedValidationIssue[] {
  if (manifest.version !== MANIFEST_VERSION) {
    return [{
      slug: '*',
      fatal: true,
      messages: [
        `unsupported manifest version ${String(manifest.version)}; this build understands ${MANIFEST_VERSION}.`,
      ],
    }]
  }

  try {
    toCanonicalJson(manifest)
  } catch (error) {
    if (error instanceof ManifestSerializationError) {
      return [{ slug: '*', fatal: true, messages: [error.message] }]
    }
    throw error
  }

  return validateSeedDefinitions(manifestToSeeds(manifest))
}
