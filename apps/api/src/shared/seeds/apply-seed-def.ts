// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Seed } from '@beechcms/core'
import { validateSeedDefinitions, planCreateSeed, planExtendSeed, planFtsRebuild } from '@beechcms/core'
import { publicProblem, internalErrorDetail } from '../../public/errors/problem-details'
import type { Env, Variables } from '../../types'

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>

/**
 * Extracts audit logging actor metadata from the request's JWT payload.
 *
 * @param context - The Hono request context.
 * @returns The actor representation containing user ID (`sub`), email address, and formatted full name.
 */
export function actorFromContext(context: AppContext) {
  const jwt = context.get('jwtPayload')
  return {
    id: jwt?.sub ?? 'unknown',
    email: jwt?.email ?? 'unknown',
    name: [jwt?.name, jwt?.surname].filter(Boolean).join(' ') || null,
  }
}

/**
 * Validates a candidate seed definition against active system seeds and applies additive schema mutations.
 *
 * @remarks
 * 1. Checks relational constraints, duplicate aliases, and format validity across all active seeds.
 * 2. Compares definition against physical database columns (`content_<slug>`).
 * 3. Plans DDL via `planCreateSeed` (new table) or `planExtendSeed` (additive columns).
 * 4. Applies DDL, definition and registry-version bump in one repository batch.
 * 5. Rebuilds the FTS5 table (destructive) when a new searchable branch was added; failure is audit-logged, not fatal.
 * 6. Dispatches an audit event to the activity logger.
 *
 * @param context - The Hono request context.
 * @param slug - The target seed slug.
 * @param candidate - The proposed seed definition.
 * @param action - Action tag for activity logging (`'create'` or `'update'`).
 * @param logDetails - Metadata payload for audit trail recording.
 * @returns `null` upon successful execution, or a 422 Unprocessable Entity Problem Details Response on validation or DDL failure.
 */
export async function validateAndApplySeedDef(context: AppContext, slug: string, candidate: Seed, action: 'create' | 'update', logDetails: any) {
  const repo = context.get('seedRepository')
  const expectedVersion = await repo.getRegistryVersion()
  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter((s: any) => s.slug !== slug), candidate]
  const issues = validateSeedDefinitions(candidateSet)
  const fatalIssues = issues.filter(i => i.fatal && i.slug === slug)
  if (fatalIssues.length > 0) {
    return publicProblem(context, {
      type: 'validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: fatalIssues.flatMap(i => i.messages).join('; '),
    })
  }

  const schemaMutator = context.get('schemaMutator')
  const tableName = `content_${slug}`
  const existingCols = await schemaMutator.getColumns(tableName)
  // The drafts table carries `live_snapshot_at`, a system column the branch loop in planExtendSeed
  // cannot emit. Introspected only for draft-enabled seeds; null otherwise, which skips the check.
  const existingDraftCols = candidate.allowDrafts
    ? await schemaMutator.getColumns(`${tableName}_drafts`)
    : null

  let ftsRebuildNeeded = false
  let applyResult
  try {
    let stmts: string[]
    if (existingCols === null) {
      stmts = planCreateSeed(candidate)
    } else {
      const plan = planExtendSeed(candidate, existingCols, existingDraftCols)
      stmts = plan.statements
      ftsRebuildNeeded = plan.ftsRebuildNeeded
    }
    applyResult = await repo.applyAtomic({ slug, definition: candidate, ddl: stmts, expectedVersion, source: 'runtime' })
  } catch (err) {
    return publicProblem(context, {
      type: 'ddl-failed',
      title: 'DDL execution failed',
      status: 422,
      detail: internalErrorDetail(context.env, err),
    })
  }

  if (!applyResult.applied) {
    return publicProblem(context, { type: 'conflict', title: 'Schema drift detected', status: 409, detail: 'The seed registry changed. Reload and retry.' })
  }

  // FTS5 cannot ALTER columns: rebuild is destructive, runs after the additive commit.
  let ftsRebuildError: string | undefined
  if (ftsRebuildNeeded) {
    try {
      const ftsStmts = planFtsRebuild(candidate)
      if (ftsStmts.length > 0) await schemaMutator.execDestructive(ftsStmts)
    } catch (err) {
      ftsRebuildError = internalErrorDetail(context.env, err)
    }
  }

  const actor = actorFromContext(context)
  const details = ftsRebuildError ? { ...logDetails, ftsRebuildError } : logDetails
  context.get('activityLogger').log({ action, entityType: 'seed', entityId: slug, details, actor })

  return null
}
