// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { auditRelationStorage } from '@beechcms/core'
import { createD1Context, exitWithError, loadLiveSeeds } from '../lib/d1-context.js'

export interface SchemaAuditOptions {
  /** Target local D1 SQLite state (default: true). */
  local?: boolean
  /** Override the D1 database name. */
  db?: string
}

/**
 * Reports relation branches whose physical storage (FK column, `rel_<slug>_<alias>` junction, FK
 * policy) no longer matches the deployed definition, typically left behind by seed edits made
 * before the additive relation gate.
 *
 * Read-only: nothing is written or repaired and stranded rows are never deleted. Exits non-zero
 * when any mismatch exists, so CI or an operator can gate on it.
 */
export async function schemaAudit(args: SchemaAuditOptions = {}): Promise<void> {
  try {
    const context = createD1Context(args)
    const seeds = await loadLiveSeeds(context)
    const findings = await auditRelationStorage(context.executor, seeds)

    console.log(pc.cyan(`\n  Relation storage audit (${context.options.db})\n`))
    if (findings.length === 0) {
      console.log(pc.green('  ✓ Every relation branch matches its physical storage.\n'))
      return
    }

    for (const finding of findings) {
      console.log(pc.yellow(`  ⚠ ${finding.seed}.${finding.alias} — ${finding.issue}`))
      console.log(pc.dim(`      expected: ${finding.expected}`))
      console.log(pc.dim(`      actual:   ${finding.actual}`))
      if (finding.strandedRows > 0) {
        console.log(pc.red(`      ${finding.strandedRows} stranded value(s) NOT read by the API; do not drop this storage`))
      }
    }
    console.log(pc.yellow(`\n  ⚠ ${findings.length} relation storage mismatch(es). Nothing was changed.\n`))
    process.exit(1)
  } catch (error) {
    exitWithError(error)
  }
}
