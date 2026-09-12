// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import pc from 'picocolors'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH, loadManifest } from '../lib/manifest-loader.js'
import { compareManifest, renderManifestDrift } from '../lib/manifest-compare.js'
import { diffSeed, isSeedClean, renderSeedDiff } from '../lib/schema-diff.js'

export interface SchemaDiffOptions {
  /** Manifest to compare against. Default: `beech.schema.ts`, skipped when absent. */
  manifest?: string
  /** Target local D1 SQLite state (default: true). */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Reports schema drift on two independent axes:
 *
 *  1. MANIFEST vs DEPLOYED DEFINITIONS — "is my snapshot stale, or does my authored manifest
 *     disagree with what is deployed?" Skipped when no manifest file exists.
 *  2. DEPLOYED DEFINITIONS vs PHYSICAL TABLES — "does `content_{slug}` actually match the
 *     definition the engine believes?" This is a fault report: the engine applies DDL on save, so
 *     divergence here means a failed or partial apply, not an authoring choice.
 *
 * Exits non-zero when either axis reports drift, so CI can gate on it. Nothing is written and no
 * DDL is emitted — reconciliation is `beech schema plan` / `beech schema apply`.
 */
export async function schemaDiff(args: SchemaDiffOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const liveSeeds = await loadLiveSeeds(context)

    const manifestPath = args.manifest ?? DEFAULT_MANIFEST_PATH
    let manifestDrifted = false

    console.log(pc.cyan(`\n  Manifest vs deployed definitions (${context.options.db})\n`))
    if (existsSync(resolve(process.cwd(), manifestPath))) {
      const manifest = await loadManifest(manifestPath)
      const drift = compareManifest(manifest, liveSeeds)
      renderManifestDrift(drift, manifestPath)
      manifestDrifted = !drift.inSync
    } else {
      console.log(pc.dim(`  ⊘ no ${manifestPath} — run \`beech schema export\` to create one`))
    }

    console.log(pc.cyan('\n  Deployed definitions vs physical tables\n'))
    let physicalDrifted = false
    for (const seed of liveSeeds) {
      // Sequential on purpose: `queryD1` is a synchronous shell/SQLite call behind a Promise, and
      // fanning it out buys nothing while making the report order non-deterministic.
      const diff = await diffSeed(seed, context.executor)
      renderSeedDiff(diff)
      if (!isSeedClean(diff)) physicalDrifted = true
    }

    console.log('')
    if (manifestDrifted || physicalDrifted) {
      console.log(pc.yellow('  ⚠ Schema drift detected.\n'))
      process.exit(1)
    }
    console.log(pc.green('  ✓ No drift.\n'))
  } catch (error) {
    exitWithError(error)
  }
}
