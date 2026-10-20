// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import {
  findTagOrphans,
  manualTagSteps,
  planTagMigration,
  tagMigrationStatements,
  type TagMigrationPlan,
} from '@beechcms/core'
import { CliError, createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'
import { executeD1File } from '../lib/wrangler.js'

export interface SchemaMigrateOptions {
  /** Write the changes. Without it the command only reports what it would do. */
  apply?: boolean
  /** Target local D1 SQLite state (default: true). */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/** Prints the steps of a plan, grouped by what the operator has to do about them. */
export function renderTagMigrationPlan(plan: TagMigrationPlan): void {
  for (const step of plan.steps) {
    if (step.action === 'manual') {
      console.log(pc.red(`  ✗ ${step.seed}: ${step.summary}`))
    } else {
      console.log(pc.green(`  ✓ ${step.seed}: ${step.summary}`))
    }
    for (const warning of step.warnings) console.log(pc.yellow(`      ⚠ ${warning}`))
  }
}

/**
 * Moves seeds saved before 0.9 to the closed-vocabulary `tags` contract: `text` + `options` becomes
 * single-choice `tags` with its stored strings wrapped into arrays, and string `options` become
 * `{ value, color }`.
 *
 * Dry run by default. `--apply` writes stored values first, then the seed definitions, then bumps the
 * registry version so running Workers rebuild their cached registry. The statements are idempotent, so
 * re-running after an interruption finishes the job. Values outside the new vocabulary are reported and
 * left in place; a seed with an unresolved branch is not rewritten at all.
 */
export async function schemaMigrate(args: SchemaMigrateOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)
    const plan = planTagMigration(seeds)

    console.log(pc.cyan(`\n  Tags contract migration (${context.options.db})\n`))
    if (plan.steps.length === 0) {
      console.log(pc.green('  ✓ Every seed already uses the closed-vocabulary tags contract. Nothing to migrate.\n'))
      return
    }

    renderTagMigrationPlan(plan)

    const orphans = await findTagOrphans(context.executor, plan, seeds)
    for (const orphan of orphans) {
      console.log(pc.yellow(
        `  ⚠ ${orphan.seed}.${orphan.alias}: ${orphan.rows} row(s) hold '${orphan.value}', which is not an option. Left untouched.`,
      ))
    }

    const manual = manualTagSteps(plan)
    const statements = tagMigrationStatements(plan, seeds)

    if (!args.apply) {
      console.log(pc.dim(`\n  Dry run: nothing was changed. ${statements.length > 0 ? 'Re-run with --apply to migrate.' : ''}`))
      if (manual.length > 0) console.log(pc.red(`  ${manual.length} step(s) need a manual edit of the seed.`))
      console.log('')
      process.exit(1)
      return
    }

    if (statements.length === 0) {
      console.log(pc.red(`\n  ✗ Nothing can be migrated automatically: ${manual.length} step(s) need a manual edit.\n`))
      process.exit(1)
      return
    }

    if (!executeD1File(statements.join('\n'), context.options)) {
      throw new CliError(
        'The migration statements failed to execute.',
        'They are idempotent: fix the reported error and run `beech schema migrate --apply` again.',
      )
    }

    const remaining = planTagMigration(await loadLiveSeeds(context))
    console.log(pc.green(`\n  ✓ Migrated ${plan.seeds.length} seed(s).`))
    if (remaining.steps.length > 0) {
      console.log(pc.yellow(`  ⚠ ${remaining.steps.length} step(s) still need attention; run \`beech schema audit\`.`))
      console.log('')
      process.exit(1)
      return
    }
    console.log(pc.dim('  Restart running Workers or wait for the registry cache to refresh, then run `beech types generate`.\n'))
  } catch (error) {
    exitWithError(error)
  }
}
