// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Branch, BranchType, Seed, NumberFieldOptions, FileFieldOptions } from '../types.js'
import type { ResolvedOptions } from './index.js'
import { schemaForBranch } from './schema-builders.js'

/** Max entries kept in {@link seedSchemaCache} before evicting the least recently used. */
const SEED_SCHEMA_CACHE_MAX_SIZE = 150

/** Cache storing compiled Zod schemas for seeds to optimize validation runs. */
const seedSchemaCache = new Map<string, z.ZodObject<Record<string, z.ZodTypeAny>>>()

/**
 * Retrieves a cache entry and marks it as most recently used.
 *
 * @param key - The cache key.
 * @returns The cached schema, or undefined if absent.
 */
function getCachedSchema(key: string): z.ZodObject<Record<string, z.ZodTypeAny>> | undefined {
  const cached = seedSchemaCache.get(key)
  if (cached) {
    seedSchemaCache.delete(key)
    seedSchemaCache.set(key, cached)
  }
  return cached
}

/**
 * Stores a cache entry, evicting the least recently used one if over capacity.
 *
 * @param key - The cache key.
 * @param value - The compiled schema to cache.
 */
function setCachedSchema(key: string, value: z.ZodObject<Record<string, z.ZodTypeAny>>): void {
  if (seedSchemaCache.size >= SEED_SCHEMA_CACHE_MAX_SIZE) {
    const oldestKey = seedSchemaCache.keys().next().value
    if (oldestKey !== undefined) seedSchemaCache.delete(oldestKey)
  }
  seedSchemaCache.set(key, value)
}

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
    const cached = getCachedSchema(key)
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
    setCachedSchema(key, compiled)
  }

  return compiled
}
