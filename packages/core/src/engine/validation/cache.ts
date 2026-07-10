// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { z } from 'zod'
import type { Branch, BranchType, Seed, NumberFieldOptions, FileFieldOptions } from '../types.js'
import type { IIdGenerator } from '../../common/id-generator.js'
import type { ResolvedOptions } from './index.js'
import { schemaForBranch } from './schema-builders.js'

type CompiledSchema = z.ZodObject<Record<string, z.ZodTypeAny>>

/** Max entries kept per cache map before evicting the least recently used. */
const SEED_SCHEMA_CACHE_MAX_SIZE = 150

/** Cache storing compiled Zod schemas for relation-free seeds. */
const seedSchemaCache = new Map<string, CompiledSchema>()

/**
 * Per-`idGenerator`-instance caches for seeds with relation branches.
 * Partitioning by instance identity keeps schemas compiled with different
 * generators (and thus different `isValid()` semantics) from colliding,
 * without needing a stable identifier on {@link IIdGenerator}.
 */
const relationSchemaCacheByGenerator = new WeakMap<IIdGenerator, Map<string, CompiledSchema>>()

/**
 * Retrieves a cache entry and marks it as most recently used.
 *
 * @param cache - The cache map to read from.
 * @param key - The cache key.
 * @returns The cached schema, or undefined if absent.
 */
function getCachedSchema(cache: Map<string, CompiledSchema>, key: string): CompiledSchema | undefined {
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
  }
  return cached
}

/**
 * Stores a cache entry, evicting the least recently used one if over capacity.
 *
 * @param cache - The cache map to write to.
 * @param key - The cache key.
 * @param value - The compiled schema to cache.
 */
function setCachedSchema(cache: Map<string, CompiledSchema>, key: string, value: CompiledSchema): void {
  if (cache.size >= SEED_SCHEMA_CACHE_MAX_SIZE) {
    const oldestKey = cache.keys().next().value
    if (oldestKey !== undefined) cache.delete(oldestKey)
  }
  cache.set(key, value)
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
  // Seeds with relation branches capture the idGenerator by closure, so their
  // schemas are cached per generator instance instead of in the shared cache
  // (different generators, e.g. SystemIdGenerator vs a test double, have
  // different isValid() semantics).
  const hasRelation = seed.branches.some((b) => b.type === 'relation')
  const key = buildCacheKey(seed, options)

  let cache: Map<string, CompiledSchema> | undefined
  if (hasRelation) {
    if (options.idGenerator) {
      cache = relationSchemaCacheByGenerator.get(options.idGenerator)
      if (!cache) {
        cache = new Map()
        relationSchemaCacheByGenerator.set(options.idGenerator, cache)
      }
    }
  } else {
    cache = seedSchemaCache
  }

  if (cache) {
    const cached = getCachedSchema(cache, key)
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

  if (cache) setCachedSchema(cache, key, compiled)

  return compiled
}
