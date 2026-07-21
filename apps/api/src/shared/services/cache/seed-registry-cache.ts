// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { SeedRegistry, buildBackrefMap } from '@beechcms/core'
import type { ISeedRegistry, BackrefMap, Seed, ISeedRepository } from '@beechcms/core'

interface CachedRegistry {
  version: number
  builtAt: number
  registry: ISeedRegistry
  backrefMap: BackrefMap
}

// Module-level = isolate-level. Survives across requests on the same isolate,
// re-initialised on cold start.
let cache: CachedRegistry | null = null

// Even if the token read fails, never serve a build older than this.
const TTL_MS = 5_000

let inFlightPromise: Promise<{ registry: ISeedRegistry; backrefMap: BackrefMap }> | null = null

/**
 * Returns a fresh-enough { registry, backrefMap }. Reads the version token once per
 * request (cheap indexed D1 read); rebuilds from listActive() only when the token
 * changed or TTL lapsed.
 */
export async function getHydratedRegistry(
  repo: ISeedRepository,
): Promise<{ registry: ISeedRegistry; backrefMap: BackrefMap }> {
  let version = -1
  let tokenError: unknown = null
  try {
    version = await repo.getRegistryVersion()
  } catch (err) {
    tokenError = err
  }
  const now = Date.now()
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

  if (inFlightPromise) {
    return inFlightPromise
  }

  inFlightPromise = repo.listActive().then((seeds) => {
    return rebuild(seeds, version, now)
  }).finally(() => {
    inFlightPromise = null
  })
  
  return inFlightPromise
}

function rebuild(seeds: Seed[], version: number, now: number) {
  const registry = new SeedRegistry(seeds)
  const backrefMap = buildBackrefMap(seeds)
  cache = { version, builtAt: now, registry, backrefMap }
  return { registry, backrefMap }
}

/** Test seam: drop the isolate cache. */
export function __resetSeedRegistryCache(): void {
  cache = null
}
