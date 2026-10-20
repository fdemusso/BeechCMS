// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { emitManifestModule, seedsToManifest } from '@beechcms/core/schema'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'
import { DEFAULT_MANIFEST_PATH } from '../lib/manifest-loader.js'

export interface SchemaExportOptions {
  /** Destination path. `null` writes to standard output. Default: `beech.schema.ts`. */
  out?: string | null
  /** Target local D1 SQLite state (default: true). Set false for remote D1. */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Writes a `beech.schema.ts` snapshot of the live schema.
 *
 * The source is LIVE D1, never an existing manifest file: a snapshot derived from another snapshot
 * can be arbitrarily stale, which is the exact failure mode `beech schema diff` exists to catch
 * (feature brief, business rule 1).
 */
export async function schemaExport(args: SchemaExportOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)
    const source = emitManifestModule(seedsToManifest(seeds))

    if (args.out === null) {
      process.stdout.write(source)
      return
    }

    const target = args.out ?? DEFAULT_MANIFEST_PATH
    const outPath = resolve(process.cwd(), target)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, source, 'utf-8')
    console.log(pc.green(`\n  ✓ Exported ${seeds.length} seed(s) → ${target}\n`))
  } catch (error) {
    exitWithError(error)
  }
}
