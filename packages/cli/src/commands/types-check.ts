// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pc from 'picocolors'
import { computeSchemaFingerprint, generateSeedTypes } from '@beechcms/core'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'
import { DEFAULT_TYPES_PATH } from './generate-types.js'

export interface TypesCheckOptions {
  /** Committed types file to check against. Default: `beech.generated.ts`. */
  out?: string
  /** Target local D1 SQLite state (default: true). Set false for remote D1. */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * CI guard for `beech.generated.ts` drift (#425): regenerates types from live D1 in memory and
 * diffs against the committed file, without writing anything on a clean run.
 *
 * This closes the gap `beech types generate` leaves open — nothing in the dispatcher previously
 * failed a build when someone applied a schema change and forgot to regenerate. Exits 1 when the
 * file is missing or stale, mirroring `beech schema diff`'s exit convention so both can gate CI.
 */
export async function typesCheck(args: TypesCheckOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)

    const fingerprint = await computeSchemaFingerprint(seeds)
    const fresh = generateSeedTypes(seeds, { fingerprint })

    const target = args.out ?? DEFAULT_TYPES_PATH
    const outPath = resolve(process.cwd(), target)

    if (!existsSync(outPath)) {
      console.log(
        pc.yellow(`\n  ⚠ ${target} not found.`) +
        pc.gray(`\n    Run \`beech types generate\` to create it.\n`)
      )
      process.exit(1)
    }

    const committed = readFileSync(outPath, 'utf-8')
    if (committed !== fresh) {
      console.log(
        pc.yellow(`\n  ⚠ ${target} is stale — it does not match the live D1 schema.`) +
        pc.gray(`\n    Run \`beech types generate\` and commit the result.\n`)
      )
      process.exit(1)
    }

    console.log(
      pc.green(`\n  ✓ ${target} matches live D1.`) +
      pc.gray(`\n    schema fingerprint ${fingerprint}\n`)
    )
  } catch (error) {
    exitWithError(error)
  }
}
