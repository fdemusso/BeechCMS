// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { randomUUID } from 'node:crypto'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { manifestToSeeds } from '@beechcms/core/schema'
import { CliError, exitWithError } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH, loadManifest } from '../lib/manifest-loader.js'
import { createControlPlane, type ControlPlane, type McpPlan } from '../lib/control-plane.js'
import { orderSeedsForApply } from '../lib/manifest-order.js'
import { renderPlan } from './schema-plan.js'

export interface SchemaApplyOptions {
  manifest?: string
  apiUrl?: string
  /** Skip the confirmation prompt. Required in a non-interactive shell. */
  yes?: boolean
}

/**
 * Applies `beech.schema.ts` to the deployed schema through the control plane.
 *
 * Three phases, in order: plan everything and show it; confirm once; then apply seed by seed, each one
 * re-planned immediately before its write so the OCC version is current and the statements are still
 * the ones the operator approved. Additive only — a seed present in D1 and absent from the manifest is
 * never touched, and destructive intent is refused by the server before anything executes.
 */
export async function schemaApply(args: SchemaApplyOptions = {}): Promise<void> {
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

    const previews = new Map<string, McpPlan>()
    for (const seed of ordered) {
      const plan = await controlPlane.plan(seed.slug, seed)
      previews.set(seed.slug, plan)
      renderPlan(plan)
    }

    const blocked = [...previews.values()].filter(plan => !plan.applicable)
    if (blocked.length > 0) {
      // All-or-nothing at the run level: applying the appliable half of a reviewed manifest leaves
      // the database in a state no manifest describes.
      throw new CliError(
        `${blocked.length} seed(s) cannot be applied: ${blocked.map(plan => plan.slug).join(', ')}. Nothing was written.`,
        'Fix the manifest, or perform the flagged changes through the endpoints named above.',
      )
    }

    const pending = ordered.filter(seed => (previews.get(seed.slug)?.statements.length ?? 0) > 0)
    if (pending.length === 0) {
      console.log(pc.green('\n  ✓ Nothing to apply — the deployed schema already matches the manifest.\n'))
      return
    }

    await confirmApply(pending, args.yes === true)

    const planId = randomUUID()
    console.log('')
    for (const seed of pending) {
      const result = await applyOne(controlPlane, seed, previews.get(seed.slug)!, planId)
      console.log(pc.green(`  ✓ ${seed.slug} — registry version ${result.newVersion}`))
      if (result.warning) console.log(pc.yellow(`    ! ${result.warning}`))
    }

    console.log(pc.green(`\n  ✓ Applied ${pending.length} seed(s).`))
    console.log(pc.dim('    Regenerate client types with `beech types generate`.\n'))
  } catch (error) {
    exitWithError(error)
  }
}

/** One write. Re-plans first: the previous seed's apply bumped `registry_version`, so the version
 *  printed in the preview is already stale by construction. */
async function applyOne(controlPlane: ControlPlane, seed: Seed, preview: McpPlan, planId: string) {
  const fresh = await controlPlane.plan(seed.slug, seed)

  if (!fresh.applicable) {
    throw new CliError(
      `'${seed.slug}' became unappliable between plan and apply: ${fresh.blockedReasons.join('; ')}`,
      'The deployed schema changed under this run. Re-run `beech schema plan`.',
    )
  }
  if (fresh.statements.join('\n') !== preview.statements.join('\n')) {
    throw new CliError(
      `The plan for '${seed.slug}' changed between review and apply. Nothing was written for it.`,
      'Someone else changed the schema during this run. Re-run `beech schema plan`.',
    )
  }

  return controlPlane.apply({ slug: seed.slug, candidate: seed, expectedVersion: fresh.expectedVersion, planId })
}

/** Single confirmation for the whole run. Refuses to guess in a non-interactive shell. */
async function confirmApply(pending: Seed[], skip: boolean): Promise<void> {
  if (skip) return
  if (!process.stdout.isTTY) {
    throw new CliError(
      'Refusing to apply schema changes without confirmation in a non-interactive shell.',
      'Re-run with --yes once the plan above has been reviewed.',
    )
  }

  const answer = await p.confirm({
    message: `Apply ${pending.length} seed(s) to the deployed schema? (${pending.map(seed => seed.slug).join(', ')})`,
    initialValue: false,
  })
  if (p.isCancel(answer) || !answer) {
    throw new CliError('Aborted. Nothing was written.')
  }
}
