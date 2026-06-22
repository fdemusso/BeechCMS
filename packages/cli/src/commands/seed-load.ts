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
  generateJunctionTable,
  generateJunctionIndexes,
  generateJunctionDraftTable,
  sortSeedsByDependencies,
  type Seed,
} from '@beechcms/core'
import { executeD1File, findWranglerConfig, resolveDbName, queryD1, sqlQuote, type WranglerOptions } from '../lib/wrangler.js'
import { diffSeed, renderSeedDiff, isSeedClean } from '../lib/schema-diff.js'
import { validateSeeds } from './validate.js'

export interface SeedLoadOptions {
  dryRun: boolean
  diff: boolean
  local: boolean
  db?: string
  registry?: Record<string, Seed> | null
}

export function buildSeedRegistrationSql(seed: Seed): string {
  const json = sqlQuote(JSON.stringify(seed))
  return [
    `INSERT INTO seeds (slug, definition, status, source, created_at, updated_at)`,
    `VALUES (${sqlQuote(seed.slug)}, ${json}, 'active', 'code', unixepoch(), unixepoch())`,
    `ON CONFLICT(slug) DO UPDATE SET definition = excluded.definition, status = 'active', updated_at = excluded.updated_at;`,
  ].join('\n')
}

const SEED_META_BUMP_SQL =
  `UPDATE seed_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE id = 'registry_version';`

function buildStatements(seed: Seed): string[] {
  const stmts: string[] = [generateCreateTable(seed), ...generateIndexes(seed)]

  const draft = generateDraftTable(seed)
  if (draft) stmts.push(draft)

  const fts = generateFtsTable(seed)
  if (fts) {
    stmts.push(fts, ...generateFtsTriggers(seed))
  }

  // Many-to-many: junction table + indexes after parent table exists (topological order
  // from sortSeedsByDependencies guarantees the target table also exists at this point).
  for (const branch of seed.branches) {
    if (branch.type !== 'relation' || branch.multiple !== true) continue
    stmts.push(generateJunctionTable(seed, branch), ...generateJunctionIndexes(seed, branch))
    const draftJunction = generateJunctionDraftTable(seed, branch)
    if (draftJunction) stmts.push(draftJunction)
  }

  return stmts
}

async function runDiff(options: WranglerOptions, registry: Record<string, Seed>): Promise<void> {
  const seeds = sortSeedsByDependencies(Object.values(registry))
  console.log(pc.cyan('\n  Diffing schema…\n'))

  let allOk = true
  for (const seed of seeds) {
    const result = await diffSeed(seed, options)
    renderSeedDiff(result)
    if (!isSeedClean(result)) allOk = false
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
      console.log(pc.dim(`  -- register ${seed.slug} in seeds table`))
      console.log(buildSeedRegistrationSql(seed) + '\n')
    }
    console.log(pc.dim('  -- bump registry_version'))
    console.log(SEED_META_BUMP_SQL + '\n')
    return
  }

  console.log(pc.cyan(`\n  Loading seeds into ${options.local ? 'local' : 'remote'} D1 (${options.db})…\n`))

  for (const seed of seeds) {
    const stmts = [...buildStatements(seed), buildSeedRegistrationSql(seed)]
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

  // Bump registry_version so live isolates re-hydrate
  executeD1File(SEED_META_BUMP_SQL, options)

  console.log(pc.green('\n  All seeds loaded.\n'))
  console.log(pc.dim('  Definitions registered in the database.'))
  console.log(pc.dim('  seed.ts is no longer required at runtime — you may keep it for code-first edits or delete it.\n'))
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

  if (!args.dryRun && !args.diff) {
    try {
      const rows = queryD1<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('seeds','seed_meta')`,
        options
      )
      if (rows.length < 2) {
        console.log(pc.red('\n  ✗ System tables not found (seeds, seed_meta)\n'))
        console.log(pc.dim('  Run `beech init --db` first to initialise the database.'))
        const flag = args.local ? ' --local' : ''
        console.log(pc.cyan(`\n  → Run: npx beech init --db${flag}\n`))
        process.exit(1)
      }
    } catch {
      console.log(pc.red('\n  ✗ Could not query the database\n'))
      console.log(pc.dim('  Run `beech init --db` first to initialise the database.'))
      process.exit(1)
    }
  }

  if (args.diff) {
    await runDiff(options, registry)
  } else {
    await runLoad(options, args.dryRun, registry)
  }
}
