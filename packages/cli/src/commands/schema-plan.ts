// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { manifestToSeeds } from '@beechcms/core/schema'
import { CliError, exitWithError } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH, loadManifest } from '../lib/manifest-loader.js'
import { createControlPlane, type ControlPlane, type McpPlan } from '../lib/control-plane.js'
import { orderSeedsForApply } from '../lib/manifest-order.js'

export interface SchemaPlanOptions {
  /** Manifest to plan. Default: `beech.schema.ts`. */
  manifest?: string
  /** API origin. Default: `BEECH_API_URL`, then `.dev.vars`, then `http://localhost:8789`. */
  apiUrl?: string
}

/**
 * Computes — and only prints — what applying `beech.schema.ts` would do.
 *
 * Nothing is written: every plan is the server's own dry run (`POST /api/seeds/:slug/mcp-plan`), so
 * the DDL displayed here is literally the DDL `beech schema apply` would execute. Exits 1 when any
 * seed is not applicable, so CI can gate on it exactly like `beech schema diff`.
 */
export async function schemaPlan(args: SchemaPlanOptions = {}): Promise<void> {
  try {
    const manifestPath = args.manifest ?? DEFAULT_MANIFEST_PATH
    const manifest = await loadManifest(manifestPath)
    const { ordered, cycles } = orderSeedsForApply(manifestToSeeds(manifest))

    if (cycles.length > 0) {
      throw new CliError(
        `Relation cycle in ${manifestPath}: ${cycles.map(cycle => cycle.join(' → ')).join('; ')}.`,
        'Apply one of these seeds without its relation branch first, then add the branch and apply again.',
      )
    }

    const controlPlane = createControlPlane({ apiUrl: args.apiUrl })
    console.log(pc.cyan(`\n  Plan for ${manifestPath} against ${controlPlane.baseUrl}\n`))

    const plans: McpPlan[] = []
    for (const seed of ordered) {
      // Sequential: each plan carries the registry version it was computed against, and a
      // concurrent plan would report a version its own apply could not use.
      const plan = await controlPlane.plan(seed.slug, seed)
      plans.push(plan)
      renderPlan(plan)
    }

    const blocked = plans.filter(plan => !plan.applicable)
    console.log('')
    if (blocked.length > 0) {
      console.log(pc.yellow(`  ⚠ ${blocked.length} seed(s) cannot be applied: ${blocked.map(p => p.slug).join(', ')}\n`))
      process.exit(1)
    }
    const changing = plans.filter(plan => plan.statements.length > 0)
    if (changing.length === 0) {
      console.log(pc.green('  ✓ Nothing to apply — the deployed schema already matches the manifest.\n'))
      return
    }
    console.log(pc.green(`  ✓ ${changing.length} seed(s) ready to apply. Run \`beech schema apply\`.\n`))
  } catch (error) {
    exitWithError(error)
  }
}

/** Renders one plan. Pure output — no exit codes, no decisions. */
export function renderPlan(plan: McpPlan): void {
  const label =
    plan.classification === 'create' ? pc.green('create') :
    plan.classification === 'additive' ? pc.cyan('additive') :
    pc.red('destructive')
  const owner = plan.source === null ? 'new' : plan.source === 'code' ? 'manifest-owned' : 'dashboard-owned'
  console.log(`  ${pc.bold(plan.slug)} — ${label} (${owner})`)

  if (plan.source === 'runtime') {
    // Ownership is set at row creation and never transfers (ROADMAP standing decision), so an
    // operator must not read a successful apply as "this seed is mine now".
    console.log(pc.dim('    note: stays dashboard-editable — applying does not transfer ownership'))
  }
  for (const issue of plan.issues) {
    for (const message of issue.messages) {
      console.log(issue.fatal ? pc.red(`    ✗ ${message}`) : pc.yellow(`    ! ${message}`))
    }
  }
  for (const reason of plan.blockedReasons) console.log(pc.red(`    ✗ ${reason}`))
  for (const statement of plan.statements) console.log(pc.dim(`    ${statement}`))
  if (plan.statements.length === 0 && plan.applicable) console.log(pc.dim('    (no change)'))
  if (plan.ftsRebuildNeeded) console.log(pc.yellow('    ! full-text index will be rebuilt after apply'))
}
