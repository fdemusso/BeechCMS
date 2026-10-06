// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed } from '../types.js'

/** Blocks writes from requests that loaded a seed immediately before its purge began. */
export function generateSeedPurgeGuards(seed: Seed): { create: string[]; drop: string[] } {
  if (!/^[a-z0-9_]+$/.test(seed.slug)) throw new Error(`Unsafe seed slug: ${seed.slug}`)
  const tables = [`content_${seed.slug}`, ...(seed.allowDrafts ? [`content_${seed.slug}_drafts`] : [])]
  const operations = ['INSERT', 'UPDATE', 'DELETE'] as const
  const create: string[] = []
  const drop: string[] = []
  for (const table of tables) {
    for (const operation of operations) {
      const name = `purge_guard_${table}_${operation.toLowerCase()}`
      create.push(`CREATE TRIGGER ${name} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'seed_purge_in_progress'); END;`)
      drop.push(`DROP TRIGGER IF EXISTS ${name};`)
    }
  }
  return { create, drop }
}
