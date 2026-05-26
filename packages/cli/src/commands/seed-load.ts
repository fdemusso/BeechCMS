// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import {
  SEED_REGISTRY,
  generateCreateTable,
  generateDraftTable,
  generateIndexes,
  generateFtsTable,
  generateFtsTriggers,
  sortSeedsByDependencies,
  type Seed,
} from '@beechcms/core'
import { executeD1File, findWranglerConfig, resolveDbName, type WranglerOptions } from '../lib/wrangler.js'
import { diffSeed } from '../lib/schema-diff.js'
import { validateSeeds } from './validate.js'

export interface SeedLoadOptions {
  dryRun: boolean
  diff: boolean
  local: boolean
  db?: string
  registry?: Record<string, Seed> | null
}

function buildStatements(seed: Seed): string[] {
  const stmts: string[] = [generateCreateTable(seed), ...generateIndexes(seed)]

  const draft = generateDraftTable(seed)
  if (draft) stmts.push(draft)

  const fts = generateFtsTable(seed)
  if (fts) {
    stmts.push(fts, ...generateFtsTriggers(seed))
  }

  return stmts
}

async function runDiff(options: WranglerOptions, registry: Record<string, Seed>): Promise<void> {
  const seeds = sortSeedsByDependencies(Object.values(registry))
  console.log(pc.cyan('\n  Diffing schema…\n'))

  let allOk = true
  for (const seed of seeds) {
    const result = await diffSeed(seed, options)
    const tableName = `content_${seed.slug}`

    if (!result.tableExists) {
      console.log(pc.red(`  ✗ ${tableName} — table missing`))
      allOk = false
      continue
    }

    const problems = result.columns.filter(c => c.status !== 'ok')
    if (problems.length === 0) {
      console.log(pc.green(`  ✓ ${tableName}`))
      continue
    }

    allOk = false
    console.log(pc.yellow(`  ⚠ ${tableName}`))
    for (const col of problems) {
      if (col.status === 'missing') {
        console.log(pc.red(`    + missing column: ${col.name} ${col.expectedType}`))
      } else if (col.status === 'extra') {
        console.log(pc.dim(`    ~ orphaned column: "${col.name}" (${col.actualType}) — exists in DB but not in seeds.ts`))
      } else if (col.status === 'type_mismatch') {
        console.log(pc.red(`    ≠ type mismatch:  ${col.name} (expected ${col.expectedType}, got ${col.actualType})`))
      } else if (col.status === 'fk_missing') {
        console.log(pc.red(`    ⤬ missing FK: ${col.name} → content_${col.expectedTarget}(id)`))
      } else if (col.status === 'fk_mismatch') {
        console.log(pc.yellow(`    ⤬ FK mismatch: ${col.name} expected ${col.expected}, got ${col.actual}`))
      } else if (col.status === 'index_missing') {
        console.log(pc.yellow(`    ⊘ missing index on ${col.name}`))
      }
    }
  }

  console.log('')
  if (allOk) {
    console.log(pc.green('  Schema matches seeds. No action needed.\n'))
  } else {
    console.log(pc.yellow('  Run `beech seed:load` to apply missing tables/columns.\n'))
  }
}

async function runLoad(options: WranglerOptions, dryRun: boolean, registry: Record<string, Seed>): Promise<void> {
  const seeds = sortSeedsByDependencies(Object.values(registry))

  if (dryRun) {
    console.log(pc.cyan('\n  -- dry-run: SQL that would be executed\n'))
    for (const seed of seeds) {
      const stmts = buildStatements(seed)
      console.log(pc.dim(`  -- content_${seed.slug}`))
      for (const stmt of stmts) {
        console.log(stmt + '\n')
      }
    }
    return
  }

  console.log(pc.cyan(`\n  Loading seeds into ${options.local ? 'local' : 'remote'} D1 (${options.db})…\n`))

  for (const seed of seeds) {
    const stmts = buildStatements(seed)
    const sql = stmts.join('\n\n') + '\n'
    process.stdout.write(`  ${pc.dim('→')} content_${seed.slug}… `)
    const ok = executeD1File(sql, options)
    if (!ok) {
      console.log(pc.red('failed'))
      console.log(pc.red(`\n  ✗ Failed to apply schema for content_${seed.slug}\n`))
      console.log(pc.dim('  wrangler reported an error above.'))
      console.log(pc.dim(`  Most likely causes:`))
      console.log(pc.dim(`    - Database "${options.db}" not found or wrong database_id`))
      if (!options.local) {
        console.log(pc.dim('    - Not logged in to Cloudflare'))
        console.log(pc.cyan('\n  → Run:  npx wrangler login'))
        console.log(pc.cyan('  → Then: npx beech seed:load\n'))
      } else {
        console.log(pc.cyan('\n  → Run:  npx beech init --db --local   # re-initialise local DB'))
        console.log(pc.cyan('  → Then: npx beech seed:load --local\n'))
      }
      process.exit(1)
    }
    console.log(pc.green('done'))
  }

  console.log(pc.green('\n  All seeds loaded.\n'))
}

export async function seedLoad(args: SeedLoadOptions): Promise<void> {
  const registry = args.registry ?? SEED_REGISTRY

  if (Object.keys(registry).length === 0) {
    console.log(pc.yellow('\n  ✗ No seeds found\n'))
    console.log(pc.dim('  Create a seeds.ts file in your project root with at least one content type.'))
    console.log(pc.cyan('\n  → Run: npx beech seed:create\n'))
    return
  }

  const validationErrors = validateSeeds(registry)
  const fatalErrors = validationErrors.filter(e => e.fatal)
  const warnings = validationErrors.filter(e => !e.fatal)

  if (fatalErrors.length > 0) {
    const total = fatalErrors.reduce((n, e) => n + e.messages.length, 0)
    const s = total !== 1 ? 's' : ''
    console.log(pc.red(`\n  ✗ Seed validation found ${total} fatal error${s}. Cannot load schema.\n`))
    for (const e of fatalErrors) {
      console.log(pc.red(`  ✗ ${e.slug}`))
      for (const msg of e.messages) {
        console.log(pc.red(`      → ${msg}`))
      }
    }
    console.log('')
    process.exit(1)
  }

  if (warnings.length > 0) {
    const total = warnings.reduce((n, e) => n + e.messages.length, 0)
    const s = total !== 1 ? 's' : ''
    console.log(pc.yellow(`\n  ⚠ Seed validation found ${total} issue${s}. Schema changes will still be applied.\n`))
    console.log(pc.dim('  Run "npx beech validate" for details.\n'))
  }

  const configPath = findWranglerConfig()
  const db = args.db ?? resolveDbName(configPath)

  const options: WranglerOptions = {
    db,
    local: args.local,
    configPath,
  }

  if (args.diff) {
    await runDiff(options, registry)
  } else {
    await runLoad(options, args.dryRun, registry)
  }
}
