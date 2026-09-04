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
  getLocalD1SqlitePath,
  type WranglerOptions,
} from '../lib/wrangler.js'

export interface GenerateTypesOptions {
  /** Output file destination. If omitted or null, output is written to standard output. */
  out?: string | null
  /** Target local D1 SQLite state (default: true). Set false for remote D1. */
  local?: boolean
  /** Override D1 database name. */
  db?: string
}

interface SeedRow {
  slug: string
  definition: string
  status?: string
  [key: string]: unknown
}

export async function generateTypes(args: GenerateTypesOptions = {}): Promise<void> {
  const isLocal = args.local !== false
  const configPath = findWranglerConfig()
  const db = args.db ?? resolveDbName(configPath)

  if (isLocal) {
    const sqlitePath = getLocalD1SqlitePath()
    if (!sqlitePath) {
      console.error(
        pc.red('\n  ✗ Local D1 database state not found.') +
        pc.gray('\n    Start your local development environment with `beech dev` or initialize with `beech init --db`.\n')
      )
      process.exit(1)
    }
  }

  const options: WranglerOptions = {
    db,
    local: isLocal,
    configPath,
  }

  let rows: SeedRow[]
  try {
    rows = queryD1<SeedRow>(
      `SELECT slug, definition FROM seeds WHERE status = 'active' ORDER BY slug ASC;`,
      options
    )
  } catch (error: any) {
    const errMsg = error?.message || String(error)
    if (errMsg.includes('no such table: seeds')) {
      console.error(
        pc.red('\n  ✗ System table `seeds` not found in database.') +
        pc.gray('\n    Run `beech init --db` or `beech onboard` to initialize system tables.\n')
      )
    } else {
      console.error(
        pc.red(`\n  ✗ Failed to introspect D1 database (${db}):`) +
        pc.gray(`\n    ${errMsg}\n`)
      )
    }
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.error(
      pc.red(`\n  ✗ No active seeds found in D1 database (${db}).`) +
      pc.gray('\n    Create or activate seeds via the dashboard (/admin) or REST API (/api/seeds).\n')
    )
    process.exit(1)
  }

  let seeds: Seed[]
  try {
    seeds = rows.map(r => JSON.parse(r.definition) as Seed)
  } catch (err: any) {
    console.error(
      pc.red('\n  ✗ Failed to parse seed definitions from database:') +
      pc.gray(`\n    ${err?.message || err}\n`)
    )
    process.exit(1)
  }

  const code = generateSeedTypes(seeds)

  if (args.out) {
    const outPath = resolve(process.cwd(), args.out)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, code, 'utf-8')
    console.log(pc.green(`\n  ✓ Generated ${seeds.length} interface(s) → ${args.out}\n`))
  } else {
    process.stdout.write(code)
  }
}

