// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module schema/define
 * Authoring DSL for `beech.schema.ts`. Pure, allocation-only helpers: they give the author
 * inference and autocomplete, and they never validate, throw, or touch I/O.
 */

import { MANIFEST_VERSION } from './manifest.types.js'
import type {
  BeechSchemaManifest,
  FieldGroup,
  ManifestBranch,
  ManifestSeed,
} from './manifest.types.js'

/** A field bundle, or the fields themselves, as accepted by `defineSeed`. */
type BranchInput = ManifestBranch | FieldGroup

function isFieldGroup(input: BranchInput): input is FieldGroup {
  return Array.isArray((input as FieldGroup).branches)
}

/**
 * Declares the root manifest. Seeds are stored in authoring order here; canonical ordering is
 * applied by `toCanonicalJson`, so a reordered manifest file produces byte-identical canonical JSON.
 */
export function defineSchema(input: { seeds: ManifestSeed[] }): BeechSchemaManifest {
  return { version: MANIFEST_VERSION, seeds: input.seeds }
}

/**
 * Declares one content type, flattening any `defineGroup()` bundles into the branch list.
 * Branch ORDER is preserved: it is the physical column order `planCreateSeed` will emit.
 */
export function defineSeed(
  input: Omit<ManifestSeed, 'branches'> & { branches: BranchInput[] },
): ManifestSeed {
  const branches: ManifestBranch[] = []
  for (const item of input.branches) {
    if (isFieldGroup(item)) branches.push(...item.branches)
    else branches.push(item)
  }
  return { ...input, branches }
}

/** Declares a reusable field bundle. Expanded at author time by `defineSeed`; never persisted. */
export function defineGroup(name: string, branches: ManifestBranch[]): FieldGroup {
  return { name, branches }
}

function field<T extends ManifestBranch['type']>(type: T) {
  return (input: Omit<ManifestBranch, 'type'>): ManifestBranch => ({ ...input, type })
}

/**
 * Typed field constructors. `relation` and `repeater` narrow their input because the engine treats
 * `targetSeed` / `fields` as required for those types — making the compiler enforce what
 * `validateSeedDefinitions` would otherwise only catch at apply time.
 */
export const defineField = {
  text: field('text'),
  number: field('number'),
  boolean: field('boolean'),
  json: field('json'),
  date: field('date'),
  richtext: field('richtext'),
  file: field('file'),
  tags: field('tags'),
  relation: (
    input: Omit<ManifestBranch, 'type' | 'targetSeed'> & { targetSeed: string },
  ): ManifestBranch => ({ ...input, type: 'relation' }),
  repeater: (
    input: Omit<ManifestBranch, 'type' | 'fields'> & { fields: ManifestBranch[] },
  ): ManifestBranch => ({ ...input, type: 'repeater' }),
} as const
