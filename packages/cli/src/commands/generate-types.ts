// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { generateSeedTypes } from '@beechcms/core'
import {
  queryD1,
  findWranglerConfig,
  resolveDbName,
  type WranglerOptions,
} from '../lib/wrangler.js'

export interface GenerateTypesOptions {
  /** Output path for the generated .ts file. */
  out: string
  /** Read from in-code SEED_REGISTRY (true) instead of introspecting D1 (false). */
  local: boolean
  /** Pre-resolved registry (injected by bin/ for --local, and by tests). */
  registry?: Record<string, Seed> | null
  /** Override D1 database name (remote path only). */
  db?: string
}

interface SeedRow { slug: string; definition: string; [key: string]: unknown }

/** Remote path: read canonical Seed JSON from the `seeds` system table. */
function loadSeedsFromD1(db: string): Seed[] {
  const configPath = findWranglerConfig()
  const options: WranglerOptions = { db, local: false, configPath }
  const rows = queryD1<SeedRow>(
    `SELECT slug, definition FROM seeds WHERE status = 'active';`,
    options,
  )
  return rows.map(r => JSON.parse(r.definition) as Seed)
}

export async function generateTypes(args: GenerateTypesOptions): Promise<void> {
  let seeds: Seed[]

  if (args.local) {
    const registry = args.registry ?? {}
    if (Object.keys(registry).length === 0) {
      console.log(pc.red('\n  ✗ No seeds found (seeds.ts empty or missing).\n'))
      process.exit(1)
    }
    seeds = Object.values(registry)
  } else {
    const db = args.db ?? resolveDbName(findWranglerConfig())
    seeds = loadSeedsFromD1(db)
    if (seeds.length === 0) {
      console.log(pc.red(`\n  ✗ No active seeds in D1 (${db}). Run \`beech seed:load\` first.\n`))
      process.exit(1)
    }
  }

  const code = generateSeedTypes(seeds)
  const outPath = resolve(process.cwd(), args.out)
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, code, 'utf-8')

  console.log(pc.green(`\n  ✓ Generated ${seeds.length} interface(s) → ${args.out}\n`))
}
