// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Seed } from '@beechcms/core'
import {
  nextBranchId,
  planCreateSeed,
  planExtendSeed,
  planFtsRebuild,
  validateSeedDefinitions,
} from '@beechcms/core'
import { publicProblem, internalErrorDetail } from '../../public/problem-details'
import type { Env, Variables } from '../../types'
import { SLUG_RE, parseJsonBody, actorFromContext } from './seeds.helpers'

/**
 * Normalizes a candidate seed definition for MCP operations:
 * - Preserves existing branch IDs from stored definition by alias matching if omitted.
 * - Auto-assigns sequential branch IDs via `nextBranchId` for new branches that lack one.
 * - Defaults `displayNameAlias` from stored definition or first text branch if omitted.
 */
export function normalizeCandidate(candidate: Seed, storedDef: Seed | null): Seed {
  const normalized: Seed = {
    ...candidate,
    branches: Array.isArray(candidate.branches) ? candidate.branches.map(b => ({ ...b })) : [],
  }

  const storedByAlias = new Map((storedDef?.branches ?? []).map(b => [b.alias, b]))
  const accSeed: Pick<Seed, 'branches'> = { branches: [] }

  for (const branch of normalized.branches) {
    if (!branch.id) {
      const stored = storedByAlias.get(branch.alias)
      if (stored?.id) {
        branch.id = stored.id
      } else {
        branch.id = nextBranchId(accSeed)
      }
    }
    accSeed.branches.push(branch)
  }

  if (!normalized.displayNameAlias) {
    if (storedDef?.displayNameAlias) {
      normalized.displayNameAlias = storedDef.displayNameAlias
    } else {
      const firstText = normalized.branches.find(b => b.type === 'text')
      if (firstText) {
        normalized.displayNameAlias = firstText.alias
      }
    }
  }

  return normalized
}

/**
 * Classification of schema migration intent for MCP agents:
 * - `'create'`: Seed does not exist; requires initial table and index creation.
 * - `'additive'`: Additive schema extensions (adding new columns/branches).
 * - `'destructive'`: Involves dropping, renaming, or retyping columns; disallowed in generic MCP apply.
 */
export type McpClassification = 'create' | 'additive' | 'destructive'

/**
 * Diffs a proposed candidate seed against the stored seed definition to detect destructive intent.
 *
 * @remarks
 * Evaluates whether any branches are omitted (drops), have altered aliases (renames),
 * or have changed types. Because `planExtendSeed` is strictly additive and cannot emit destructive DDL,
 * destructive intent must be classified here to reject or require confirmation.
 *
 * @param stored - Stored seed definition from the repository, or `null` if creating.
 * @param candidate - Proposed candidate seed definition.
 * @returns An object with the classification (`create`, `additive`, or `destructive`) and a list of blocking reasons.
 */
export function classifyCandidate(stored: Seed | null, candidate: Seed): {
  classification: McpClassification
  blockedReasons: string[]
} {
  if (!stored) return { classification: 'create', blockedReasons: [] }

  const reasons: string[] = []
  const incomingById = new Map((candidate.branches ?? []).map(b => [b.id, b]))

  for (const prev of stored.branches) {
    const next = incomingById.get(prev.id)
    if (!next) {
      reasons.push(`branch '${prev.id}' (${prev.alias}) would be dropped — use DELETE /api/seeds/${candidate.slug}/branches/${prev.id}`)
      continue
    }
    if (next.alias !== prev.alias) {
      reasons.push(`branch '${prev.id}' alias rename '${prev.alias}' → '${next.alias}' — use PATCH /api/seeds/${candidate.slug}/branches/${prev.id}/rename`)
    }
    if (next.type !== prev.type) {
      reasons.push(`branch '${prev.id}' type change '${prev.type}' → '${next.type}' — use PATCH /api/seeds/${candidate.slug}/branches/${prev.id}/retype`)
    }
  }

  return { classification: reasons.length > 0 ? 'destructive' : 'additive', blockedReasons: reasons }
}

export const mcpApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Computes a dry-run, non-mutating schema migration plan for MCP AI agents and developer tooling.
 *
 * @remarks
 * - Performs full-set cross-seed validation (relation integrity, reserved aliases, slug format).
 * - Diffs candidate against stored definition to classify changes as `'create'`, `'additive'`, or `'destructive'`.
 * - Inspects physical SQLite columns (`content_<slug>`) to compute the exact SQL statements that would execute.
 * - Detects whether changes to text/searchable branches require rebuilding the FTS5 index.
 * - Returns the current schema registry version to feed into optimistic concurrency control (OCC) checks on apply.
 *
 * @route POST /api/seeds/:slug/mcp-plan
 * @param slug - Seed slug identifier.
 * @returns 200 OK with the migration plan object, or 400/422 Problem Details on error.
 */
mcpApp.post('/:slug/mcp-plan', async (context) => {
  const slug = context.req.param('slug')
  if (!SLUG_RE.test(slug)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `slug must match ${SLUG_RE.source}.` })
  }

  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const candidateInput = (body as { candidate?: unknown }).candidate
  if (!candidateInput || typeof candidateInput !== 'object') {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: '`candidate` must be a Seed object.' })
  }
  const rawCandidate: Seed = { ...(candidateInput as Seed), slug }

  const repo = context.get('seedRepository')
  const schemaMutator = context.get('schemaMutator')

  const stored = await repo.get(slug)
  const storedDef = stored && stored.status !== 'deleted' ? stored.definition : null
  const candidate = normalizeCandidate(rawCandidate, storedDef)

  // Full-set validation: relation targets can only be checked against every active seed.
  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter((s: Seed) => s.slug !== slug), candidate]
  const issues = validateSeedDefinitions(candidateSet)
    .filter(i => i.slug === slug)
    .map(i => ({ fatal: i.fatal, messages: i.messages }))

  const { classification, blockedReasons } = classifyCandidate(storedDef, candidate)

  // Physical columns — the ONLY correct input for planExtendSeed.
  const existingCols = await schemaMutator.getColumns(`content_${slug}`)

  let statements: string[] = []
  let ftsRebuildNeeded = false
  if (blockedReasons.length === 0 && !issues.some(i => i.fatal)) {
    if (existingCols === null) {
      statements = planCreateSeed(candidate)
    } else {
      const plan = planExtendSeed(candidate, existingCols)
      statements = plan.statements
      ftsRebuildNeeded = plan.ftsRebuildNeeded
    }
  }

  const currentVersion = await repo.getRegistryVersion()

  return context.json({
    slug,
    classification,                                   // 'create' | 'additive' | 'destructive'
    requiresConfirmation: classification === 'destructive',
    applicable: blockedReasons.length === 0 && !issues.some(i => i.fatal),
    blockedReasons,                                   // non-empty ⇒ mcp-apply will refuse
    statements,                                       // exactly the DDL mcp-apply will run
    ftsRebuildNeeded,
    expectedVersion: currentVersion,                  // feed this straight back into mcp-apply
    issues,
  }, 200)
})

/**
 * Atomically applies an additive schema migration with optimistic concurrency control (OCC).
 *
 * @remarks
 * - Designed for autonomous MCP agents and CI/CD schema deployment workflows.
 * - Validates the candidate against the full active seed set.
 * - Strictly enforces additive-only changes (`classifyCandidate`); destructive intent (column drops,
 *   renames, type changes) is rejected and directed to dedicated confirmation endpoints.
 * - Executes physical DDL and definition upsert in a single CAS-guarded atomic batch (`applyAtomic`).
 * - Rejects with 409 Conflict if registry version drifted (`expectedVersion !== currentVersion`).
 * - Executes post-apply FTS5 rebuilding if required.
 * - Appends a structured audit event to the activity logger recording actor, plan ID, DDL count, and schema revision.
 *
 * @route POST /api/seeds/:slug/mcp-apply
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ slug, newVersion, ftsRebuilt, warning? }`, or 400/409/422 Problem Details on error.
 */
mcpApp.post('/:slug/mcp-apply', async (context) => {
  const slug = context.req.param('slug')
  if (!SLUG_RE.test(slug)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `slug must match ${SLUG_RE.source}.` })
  }

  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const { candidate: candidateInput, expectedVersion, planId } = body as {
    candidate?: unknown
    expectedVersion?: unknown
    planId?: unknown
  }

  if (!candidateInput || typeof candidateInput !== 'object') {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: '`candidate` must be a Seed object.' })
  }
  if (!Number.isInteger(expectedVersion)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: '`expectedVersion` must be an integer. Obtain it from POST /api/seeds/:slug/mcp-plan.' })
  }
  const rawCandidate: Seed = { ...(candidateInput as Seed), slug }

  const repo = context.get('seedRepository')
  const schemaMutator = context.get('schemaMutator')

  const stored = await repo.get(slug)
  const storedDef = stored && stored.status !== 'deleted' ? stored.definition : null
  const candidate = normalizeCandidate(rawCandidate, storedDef)

  // 1 — validate against the full active set (relation targets, reserved aliases, slug format)
  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter((s: Seed) => s.slug !== slug), candidate]
  const fatalIssues = validateSeedDefinitions(candidateSet).filter(i => i.fatal && i.slug === slug)
  if (fatalIssues.length > 0) {
    return publicProblem(context, {
      type: 'validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: fatalIssues.flatMap(i => i.messages).join('; '),
    })
  }

  // 2 — additive-only gate. Destructive intent is REJECTED, never confirmed here: drop /
  //     rename / retype have dedicated endpoints with their own typed confirm tokens.
  const { classification, blockedReasons } = classifyCandidate(storedDef, candidate)
  if (blockedReasons.length > 0) {
    return publicProblem(context, {
      type: 'destructive-change-not-supported',
      title: 'Destructive change not supported on mcp-apply',
      status: 422,
      detail: blockedReasons.join('; '),
    })
  }

  // 3 — plan the DDL against the PHYSICAL columns
  const existingCols = await schemaMutator.getColumns(`content_${slug}`)
  let ddl: string[]
  let ftsRebuildNeeded = false
  if (existingCols === null) {
    ddl = planCreateSeed(candidate)
  } else {
    const plan = planExtendSeed(candidate, existingCols)
    ddl = plan.statements
    ftsRebuildNeeded = plan.ftsRebuildNeeded
  }

  // 4 — ONE atomic batch: CAS guard + DDL + upsert + version bump
  let result
  try {
    result = await repo.applyAtomic({
      slug,
      definition: candidate,
      ddl,
      expectedVersion: expectedVersion as number,
      source: 'runtime',
    })
  } catch (err) {
    return publicProblem(context, {
      type: 'ddl-failed',
      title: 'Atomic apply failed',
      status: 422,
      detail: internalErrorDetail(context.env, err),
    })
  }

  if (!result.applied) {
    return publicProblem(context, {
      type: 'conflict',
      title: 'Schema drift detected',
      status: 409,
      detail: `Registry version mismatch: planned against ${expectedVersion}, database is at ${result.version}. Nothing was written. Re-run mcp-plan.`,
    })
  }

  // 5 — FTS5 tail. SQLite cannot ALTER an fts5 table's columns, so a rebuild is DESTRUCTIVE
  //     and must go through execDestructive — it cannot join the additive batch above.
  //     It runs after a committed apply; on failure the schema is still correct and the agent
  //     is told to call the existing rebuild endpoint.
  let warning: string | undefined
  if (ftsRebuildNeeded) {
    try {
      const ftsStmts = planFtsRebuild(candidate)
      if (ftsStmts.length > 0) await schemaMutator.execDestructive(ftsStmts)
    } catch (err) {
      warning = `Schema applied, but the FTS5 rebuild failed: ${internalErrorDetail(context.env, err)}. Call POST /api/seeds/${slug}/fts/rebuild to restore full-text search.`
    }
  }

  // 6 — audit trail (Issue #328: actor, tool, plan id, schema revision, outcome)
  const actor = actorFromContext(context)
  context.get('activityLogger').log({
    action: existingCols === null ? 'create' : 'update',
    entityType: 'seed',
    entityId: slug,
    details: {
      op: 'mcp-apply',
      planId: typeof planId === 'string' ? planId : null,
      classification,
      expectedVersion,
      newVersion: result.version,
      ddlCount: ddl.length,
      ftsRebuilt: ftsRebuildNeeded && !warning,
      outcome: warning ? 'partial' : 'ok',
    },
    actor,
  })

  return context.json({ slug, newVersion: result.version, ftsRebuilt: ftsRebuildNeeded && !warning, ...(warning ? { warning } : {}) }, 200)
})
