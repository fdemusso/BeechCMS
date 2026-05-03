import pc from 'picocolors'
import {
  SEED_REGISTRY,
  generateCreateTable,
  generateDraftTable,
  generateIndexes,
  generateFtsTable,
  generateFtsTriggers,
  type Seed,
} from '@beechcms/core'
import { executeD1File, findWranglerConfig, resolveDbName, type WranglerOptions } from '../lib/wrangler.js'
import { diffSeed } from '../lib/schema-diff.js'

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
  const seeds = Object.values(registry)
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
        console.log(pc.dim(`    ~ extra column:   ${col.name} ${col.actualType}`))
      } else if (col.status === 'type_mismatch') {
        console.log(pc.red(`    ≠ type mismatch:  ${col.name} (expected ${col.expectedType}, got ${col.actualType})`))
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
  const seeds = Object.values(registry)

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
    executeD1File(sql, options)
    console.log(pc.green('done'))
  }

  console.log(pc.green('\n  All seeds loaded.\n'))
}

export async function seedLoad(args: SeedLoadOptions): Promise<void> {
  const registry = args.registry ?? SEED_REGISTRY

  if (Object.keys(registry).length === 0) {
    console.warn(pc.yellow('\n  Warning: SEED_REGISTRY is empty. Create a seeds.ts in your project root.\n'))
    return
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
