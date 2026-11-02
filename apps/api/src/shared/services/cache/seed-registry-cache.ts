// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { createTolerantSeedRegistry, buildBackrefMap } from '@beechcms/core'
import type { ISeedRegistry, BackrefMap, Seed, ISeedRepository, QuarantinedSeed } from '@beechcms/core'

interface CachedRegistry {
  version: number
  builtAt: number
  registry: ISeedRegistry
  backrefMap: BackrefMap
}

type HydratedRegistry = { registry: ISeedRegistry; backrefMap: BackrefMap }

interface InFlightBuild {
  version: number
  promise: Promise<HydratedRegistry>
}

interface RepositoryCacheState {
  cache: CachedRegistry | null
  inFlight: InFlightBuild | null
}

// Module-level = isolate-level. Survives across requests on the same isolate,
// re-initialised on cold start. Keyed by repository instance: two apps (or databases)
// in one isolate can report the same version token for different seeds.
let states = new WeakMap<ISeedRepository, RepositoryCacheState>()

// Even if the token read fails, never serve a build older than this.
const TTL_MS = 5_000

function stateFor(repo: ISeedRepository): RepositoryCacheState {
  let state = states.get(repo)
  if (!state) {
    state = { cache: null, inFlight: null }
    states.set(repo, state)
  }
  return state
}

/**
 * Returns a fresh-enough { registry, backrefMap }. Reads the version token once per
 * request (cheap indexed D1 read); rebuilds from listActive() only when the token
 * changed or TTL lapsed. The repository instance must be stable across requests for the
 * cache to hit (repositoryMiddleware memoizes the D1 one per binding).
 */
export async function getHydratedRegistry(repo: ISeedRepository): Promise<HydratedRegistry> {
  const state = stateFor(repo)
  let version = -1
  let tokenError: unknown = null
  try {
    version = await repo.getRegistryVersion()
  } catch (err) {
    tokenError = err
  }
  const now = Date.now()
  const { cache } = state
  if (cache) {
    const isVersionMatch = version !== -1 && cache.version === version
    const isFresh = now - cache.builtAt < TTL_MS
    if ((isVersionMatch && isFresh) || (tokenError && isFresh)) {
      return { registry: cache.registry, backrefMap: cache.backrefMap }
    }
  }

  if (tokenError) {
    throw tokenError
  }

  // Join only a build started at the version this request read: an older build may have
  // listed seeds before the write that bumped the token.
  const joined = state.inFlight
  if (joined && joined.version === version) {
    return joined.promise
  }

  const build: InFlightBuild = {
    version,
    promise: repo.listActive().then((seeds) => rebuild(state, build, seeds, version, now)).finally(() => {
      if (state.inFlight === build) state.inFlight = null
    }),
  }
  state.inFlight = build

  return build.promise
}

// A quarantined seed is reported once per isolate, not on every cache rebuild.
const warnedQuarantine = new Set<string>()

/**
 * Logs seeds the registry refused to serve. Pointing at `beech schema migrate` matters: the usual
 * cause is a definition saved before 0.9, which that command rewrites.
 */
export function warnQuarantinedSeeds(quarantined: ReadonlyArray<QuarantinedSeed>): void {
  for (const { slug, reason } of quarantined) {
    const key = `${slug}:${reason}`
    if (warnedQuarantine.has(key)) continue
    warnedQuarantine.add(key)
    console.warn(
      `[BeechCMS] Seed "${slug}" is disabled until its definition is fixed: ${reason} `
      + `Run "beech schema migrate" (add --remote for production) to repair it.`,
    )
  }
}

function rebuild(state: RepositoryCacheState, build: InFlightBuild, seeds: Seed[], version: number, now: number) {
  const { registry, quarantined } = createTolerantSeedRegistry(seeds)
  warnQuarantinedSeeds(quarantined)
  const backrefMap = buildBackrefMap(registry.all())
  // A superseded build still serves its own callers but must not overwrite a newer cache entry.
  if (state.inFlight === build) {
    state.cache = { version, builtAt: now, registry, backrefMap }
  }
  return { registry, backrefMap }
}

/** Test seam: drop the isolate cache. */
export function __resetSeedRegistryCache(): void {
  states = new WeakMap()
  warnedQuarantine.clear()
}
