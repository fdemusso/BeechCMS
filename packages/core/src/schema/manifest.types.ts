// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/manifest.types
 * Data shapes for the `beech.schema.ts` desired-state manifest. Pure types — no runtime logic.
 *
 * A manifest is NOT a runtime authority: D1 remains the sole runtime source of truth. These types
 * describe an artifact that is authored, reviewed in Git, and reconciled through an explicit
 * plan/apply step.
 */

import type { Branch, Seed } from '../engine/types.js'

/**
 * Manifest format version. Bumped ONLY on a breaking change to the manifest shape — never on an
 * additive field. `fromCanonicalJson` refuses any other value rather than guessing.
 */
export const MANIFEST_VERSION = 1

/**
 * A field as written by hand in a manifest.
 *
 * `id` is optional at authoring time: nobody hand-writes `br_07`, and an author-invented id would
 * collide with the ids the engine already minted. It is filled in by `manifestToSeeds()` purely so
 * validation has a complete `Seed`; the AUTHORITATIVE assignment happens at plan/apply time, where
 * `normalizeCandidate()` preserves the stored id by alias match before minting a new one.
 * `fields` is recursive for `repeater` sub-fields, which carry the same rule.
 */
export type ManifestBranch = Omit<Branch, 'id' | 'fields'> & {
  id?: string
  fields?: ManifestBranch[]
}

/**
 * A content type as written in a manifest.
 *
 * `layout` is deliberately absent: it is typed `unknown`, is populated server-side by
 * `GET /api/schema`, and is not a schema concern. Round-tripping it would make a future
 * `beech schema diff` report permanent false drift.
 */
export type ManifestSeed = Omit<Seed, 'branches' | 'layout'> & {
  branches: ManifestBranch[]
}

/**
 * A reusable bundle of fields (e.g. an SEO block shared by several seeds).
 *
 * Author-time only: `defineSeed()` splices `branches` into the seed's own list and the group leaves
 * ZERO trace in canonical JSON. It is a macro, not a persisted concept — there is exactly one
 * grouping mechanism in D1, and this is not it.
 */
export interface FieldGroup {
  name: string
  branches: ManifestBranch[]
}

/** The root artifact: the whole desired schema state. */
export interface BeechSchemaManifest {
  version: typeof MANIFEST_VERSION
  seeds: ManifestSeed[]
}
