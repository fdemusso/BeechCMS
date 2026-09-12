// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import pc from 'picocolors'
import { computeSchemaFingerprint, generateSeedTypes } from '@beechcms/core'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'

/** Where `beech types generate` writes when no destination is given. */
export const DEFAULT_TYPES_PATH = 'beech.generated.ts'

export interface GenerateTypesOptions {
  /** Output destination. `null` writes to standard output. Default: `beech.generated.ts`. */
  out?: string | null
  /** Target local D1 SQLite state (default: true). Set false for remote D1. */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Emits `SeedRegistryTypes` plus the schema fingerprint from LIVE D1 state.
 *
 * Both artifacts derive from `introspectSeedDefinitions`, never from `beech.schema.ts`: a manifest
 * file may legitimately be ahead of or behind what is deployed, and types that are ahead of the
 * database are exactly the silent shape mismatch this chain exists to eliminate (feature brief,
 * business rule 1).
 */
export async function generateTypes(args: GenerateTypesOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)

    const fingerprint = await computeSchemaFingerprint(seeds)
    const code = generateSeedTypes(seeds, { fingerprint })

    if (args.out === null) {
      process.stdout.write(code)
      return
    }

    const target = args.out ?? DEFAULT_TYPES_PATH
    const outPath = resolve(process.cwd(), target)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, code, 'utf-8')
    console.log(
      pc.green(`\n  ✓ Generated ${seeds.length} interface(s) → ${target}`) +
      pc.gray(`\n    schema fingerprint ${fingerprint}\n`)
    )
  } catch (error) {
    exitWithError(error)
  }
}
