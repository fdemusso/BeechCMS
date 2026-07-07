// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Branch, BranchType, Seed, NumberFieldOptions, FileFieldOptions } from '../types.js'
import type { ResolvedOptions } from './index.js'
import { schemaForBranch } from './schema-builders.js'

/** Cache storing compiled Zod schemas for seeds to optimize validation runs. */
const seedSchemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>()

/**
 * Represents the typesafe structure of a fingerprinted branch for cache key generation.
 */
interface BranchFingerprint {
  /** The branch alias. */
  a: string
  /** The branch type. */
  t: BranchType
  /** The branch format option, or null. */
  f: string | null
  /** Whether the branch accepts multiple values. */
  m: boolean
  /** Whether the branch is required on creation. */
  rc: boolean
  /** Whether the branch is required on update. */
  ru: boolean
  /** Advanced number configuration options, or null. */
  n: NumberFieldOptions | null
  /** Advanced file configuration options, or null. */
  fi: FileFieldOptions | null
  /** Minimum item count constraint (for repeaters), or null. */
  mi: number | null
  /** Maximum item count constraint (for repeaters), or null. */
  ma: number | null
  /** Nested sub-branches fingerprints (for repeaters), or null. */
  sub: BranchFingerprint[] | null
}

/**
 * Recursively generates a typesafe fingerprint object for a branch and its sub-branches.
 *
 * @param branch - The branch definition.
 * @returns The structured branch fingerprint object.
 */
function buildBranchFingerprint(branch: Branch): BranchFingerprint {
  return {
    a: branch.alias,
    t: branch.type,
    f: branch.format ?? null,
    m: branch.multiple === true,
    rc: branch.requiredOnCreate === true,
    ru: branch.requiredOnUpdate === true,
    n: branch.numberOptions ?? null,
    fi: branch.fileOptions ?? null,
    mi: branch.minItems ?? null,
    ma: branch.maxItems ?? null,
    sub: branch.fields?.map(buildBranchFingerprint) ?? null,
  }
}

/**
 * Generates a unique JSON fingerprint string representing a seed's structure for caching.
 *
 * @param seed - The seed definition.
 * @returns The fingerprint string.
 */
function buildSeedFingerprint(seed: Seed): string {
  const parts = seed.branches.map(buildBranchFingerprint)
  return JSON.stringify({ s: seed.slug, b: parts })
}

/**
 * Builds a cache key for a seed validation schema combining its fingerprint, operation, and options.
 *
 * @param seed - The seed definition.
 * @param options - The resolved validation options.
 * @returns The cache key string.
 */
function buildCacheKey(seed: Seed, options: ResolvedOptions): string {
  return [
    buildSeedFingerprint(seed),
    options.operation,
    options.allowNull ? '1' : '0',
    options.enforceRequiredFields ? '1' : '0',
    String(options.maxTextLength),
  ].join('|')
}

/**
 * Compiles or retrieves from cache the full Zod validation schema for a seed structure.
 *
 * @param seed - The seed definition.
 * @param options - The resolved validation options.
 * @returns The compiled strict Zod object schema.
 */
export function compileSeedSchema(seed: Seed, options: ResolvedOptions): z.ZodObject<Record<string, z.ZodTypeAny>> {
  // Seeds with relation branches cannot be safely cached because the schema
  // captures the idGenerator by closure, and different generators (e.g.
  // SystemIdGenerator vs SequentialIdGenerator) have different isValid() semantics.
  const hasRelation = seed.branches.some((b) => b.type === 'relation')

  if (!hasRelation) {
    const key = buildCacheKey(seed, options)
    const cached = seedSchemaCache.get(key)
    if (cached) return cached
  }

  const requiredFlag = options.operation === 'create' ? 'requiredOnCreate' : 'requiredOnUpdate'
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const branch of seed.branches) {
    const branchSchema = schemaForBranch(branch, options)
    const isRequired = branch[requiredFlag] && options.enforceRequiredFields
    shape[branch.alias] = isRequired ? branchSchema : branchSchema.optional()
  }
  const compiled = z.object(shape).strict()

  if (!hasRelation) {
    const key = buildCacheKey(seed, options)
    seedSchemaCache.set(key, compiled)
  }

  return compiled
}
