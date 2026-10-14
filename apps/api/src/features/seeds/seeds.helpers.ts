// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Branch, Seed, SeedRecord } from '@beechcms/core'
import {
  nextBranchId,
  validateSeedDefinitions,
  planCreateSeed,
  planExtendSeed,
  planFtsRebuild,
  SLUG_RE,
} from '@beechcms/core'
import { publicProblem, internalErrorDetail } from '../../public/errors/problem-details'
import type { Env, Variables } from '../../types'

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>

export { SLUG_RE }

/**
 * Guard ensuring the authenticated caller possesses the `'admin'` role.
 *
 * @param context - The Hono request context with bound JWT payload variables.
 * @returns A 403 Forbidden RFC 7807 Problem Details Response if unauthorized, or `null` if authorized.
 */
export function requireAdmin(context: AppContext) {
  const role = context.get('jwtPayload')?.role
  if (role !== 'admin') {
    return publicProblem(context, {
      type: 'forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Seed management requires admin role.',
    })
  }
  return null
}

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
 * Safely parses the incoming HTTP request body as JSON.
 *
 * @param context - The Hono request context.
 * @returns The parsed JSON body payload, or a 400 Bad Request Problem Details Response on syntax failure.
 */
export async function parseJsonBody(context: AppContext): Promise<unknown> {
  try { return await context.req.json() } catch {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be valid JSON.' })
  }
}

/**
 * Parses the request body as JSON and requires it to be a plain object.
 *
 * @remarks
 * Valid JSON of another shape (`null`, a number, a string, an array) is a client error, not a crash:
 * handlers read properties off the body immediately.
 *
 * @param context - The Hono request context.
 * @returns The parsed object, or a 400 Bad Request Problem Details Response.
 */
export async function parseJsonObject(context: AppContext): Promise<Record<string, unknown> | Response> {
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body
  if (!isPlainObject(body)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be a JSON object.' })
  }
  return body
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Rejects a candidate whose `branches` (or a repeater's `fields`) holds an entry that is not an object.
 *
 * @param context - The Hono request context.
 * @param branches - The raw `branches` value of the candidate; non-arrays are left to seed validation.
 * @returns A 400 Bad Request Problem Details Response, or `null` when every entry is an object.
 */
export function rejectMalformedBranches(context: AppContext, branches: unknown) {
  if (!Array.isArray(branches)) return null
  const malformed = branches.some(branch =>
    !isPlainObject(branch) || (Array.isArray(branch.fields) && branch.fields.some(field => !isPlainObject(field))),
  )
  if (!malformed) return null
  return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: '`branches` entries (and repeater `fields` entries) must be objects.' })
}

/**
 * Slugs of the OTHER seeds that hold a relation to `slug`.
 *
 * A relation back to its own seed dies with the seed, so it never blocks deleting it.
 */
export function externalReferencers(context: AppContext, slug: string): string[] {
  const inbound = context.get('backrefMap').get(slug) ?? []
  return [...new Set(inbound.map(ref => ref.sourceSlug).filter(source => source !== slug))]
}

/**
 * Whether an automation refers to a branch alias.
 *
 * Matches the alias as a whole identifier inside any string VALUE of the automation (templates such as
 * `{{this.title}}`, `field`, `column`). Substrings of a longer identifier and JSON keys do not count.
 */
export function automationReferencesAlias(automation: unknown, alias: string): boolean {
  const token = new RegExp(`(?<![A-Za-z0-9_])${alias}(?![A-Za-z0-9_])`)
  const visit = (value: unknown): boolean => {
    if (typeof value === 'string') return token.test(value)
    if (Array.isArray(value)) return value.some(visit)
    if (isPlainObject(value)) return Object.values(value).some(visit)
    return false
  }
  return visit(automation)
}

/**
 * Retrieves an active seed record by slug from the database repository.
 *
 * @param context - The Hono request context.
 * @param slug - The unique slug identifier of the seed.
 * @returns The active seed entity record, or a 404 Not Found Problem Details Response if nonexistent or soft-deleted.
 */
export async function getActiveSeed(context: AppContext, slug: string) {
  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)
  if (!existing || existing.status === 'deleted') {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No active seed with slug '${slug}'.` })
  }
  return existing
}

/**
 * Retrieves a seed record by slug whatever its status, so a soft-deleted seed can still be purged.
 *
 * @param context - The Hono request context.
 * @param slug - The unique slug identifier of the seed.
 * @returns The seed entity record (`active` or `deleted`), or a 404 Not Found Problem Details Response if it does not exist.
 */
export async function getSeedAnyStatus(context: AppContext, slug: string) {
  const existing = await context.get('seedRepository').get(slug)
  if (!existing) {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No seed with slug '${slug}'.` })
  }
  return existing
}

/**
 * Refuses an interactive (dashboard/REST) mutation of a manifest-owned seed.
 *
 * A seed with `source = 'code'` is owned by `beech.schema.ts`. Letting the dashboard edit it would
 * make `beech schema diff` report drift it can never explain — the manifest would be silently wrong
 * about a schema it is supposed to describe. Ownership is set at row creation and is immutable:
 * `D1SeedRepository.UPSERT_SEED_SQL`'s `ON CONFLICT DO UPDATE` clause deliberately omits `source`.
 *
 * NOT called on creation (`POST /api/seeds`) — a seed that does not exist has no owner — and NOT
 * called on the MCP control-plane routes, which are the sanctioned manifest apply path.
 *
 * @returns A 409 Problem Details Response when the seed is manifest-owned, or `null` when it is not.
 */
export function rejectManifestOwned(context: AppContext, record: SeedRecord) {
  if (record.source !== 'code') return null
  return publicProblem(context, {
    type: 'seed-manifest-owned',
    title: 'Seed is manifest-owned',
    status: 409,
    detail:
      `Seed '${record.slug}' is owned by beech.schema.ts (source='code') and cannot be edited here. ` +
      `Edit the manifest and re-apply it.`,
  })
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

/**
 * Executes destructive DDL statements and persists the updated seed definition.
 *
 * @remarks
 * Used for operations that cannot be planned additively (e.g. column drops, renames, and type conversions).
 * Rejects fatal validation issues, then applies destructive DDL, the stored definition,
 * and the registry-version bump as one batch before logging the operation.
 *
 * @param context - The Hono request context.
 * @param slug - The unique slug identifier of the seed.
 * @param updatedDef - The new seed definition reflecting the destructive change.
 * @param stmts - The SQL DDL statements generated for the destructive migration.
 * @param logDetails - Operation details for the audit log.
 * @returns `null` on success, or a 422 Unprocessable Entity Problem Details Response on DDL execution failure.
 */
export async function applyDestructiveSeedDef(context: AppContext, slug: string, updatedDef: Seed, stmts: string[], logDetails: any) {
  const repo = context.get('seedRepository')
  const expectedVersion = await repo.getRegistryVersion()

  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter((s: any) => s.slug !== slug), updatedDef]
  const fatalIssues = validateSeedDefinitions(candidateSet).filter(i => i.fatal && i.slug === slug)
  if (fatalIssues.length > 0) {
    return publicProblem(context, {
      type: 'validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: fatalIssues.flatMap(i => i.messages).join('; '),
    })
  }

  let applyResult
  try {
    applyResult = await repo.applyDestructiveAtomic({ slug, definition: updatedDef, ddl: stmts, expectedVersion, operation: 'update' })
  } catch (err) {
    return publicProblem(context, { type: 'ddl-failed', title: 'DDL failed', status: 422, detail: internalErrorDetail(context.env, err) })
  }

  if (!applyResult.applied) {
    return publicProblem(context, { type: 'conflict', title: 'Schema drift detected', status: 409, detail: 'The seed registry changed. Reload and retry.' })
  }

  const actor = actorFromContext(context)
  context.get('activityLogger').log({ action: 'update', entityType: 'seed', entityId: slug, details: logDetails, actor })

  return null
}

/**
 * Typed confirmation guard for destructive operations.
 *
 * @remarks
 * Validates that the request body contains a string field `confirm` matching `expected`
 * (e.g. `<slug>` for hard drops, or `<slug>.<branchAlias>` for column drops/renames/retypes).
 *
 * @param context - The Hono request context.
 * @param expected - Expected confirmation token string.
 * @param body - Parsed request body object.
 * @returns `null` if confirmation matches, or a 400 Bad Request Problem Details Response on mismatch.
 */
export function requireConfirm(context: AppContext, expected: string, body: unknown) {
  const confirm = (body as Record<string, unknown>)?.confirm
  if (typeof confirm !== 'string' || confirm !== expected) {
    return publicProblem(context, {
      type: 'confirmation-required',
      title: 'Confirmation required',
      status: 400,
      detail: `Destructive operation requires body field \`confirm\` equal to "${expected}".`,
    })
  }
  return null
}

/** Returns relation changes that require physical storage or FK migration. */
export function relationChangeReasons(stored: Branch, incoming: Branch): string[] {
  if (stored.type !== 'relation' || incoming.type !== 'relation') return []

  const reasons: string[] = []
  if ((stored.multiple === true) !== (incoming.multiple === true)) {
    reasons.push(`branch '${stored.id}' (${stored.alias}) relation multiplicity change requires a data migration`)
  }
  if (stored.targetSeed !== incoming.targetSeed) {
    reasons.push(`branch '${stored.id}' (${stored.alias}) relation target change requires a data migration`)
  }
  const storedOnDelete = stored.onDelete ?? (stored.multiple === true ? 'CASCADE' : 'SET NULL')
  const incomingOnDelete = incoming.onDelete ?? (incoming.multiple === true ? 'CASCADE' : 'SET NULL')
  if (storedOnDelete !== incomingOnDelete) {
    reasons.push(`branch '${stored.id}' (${stored.alias}) relation delete behavior change requires a data migration`)
  }
  return reasons
}

/**
 * Validates incoming branches during a definition update (PUT) to reject unconfirmed destructive operations.
 *
 * @remarks
 * Compares incoming branches against stored definitions by ID. Alias renames and branch type changes
 * point callers to dedicated PATCH endpoints; relation storage changes require a data migration.
 * Allocates ids for newly appended branches lacking one via {@link assignMissingBranchIds}.
 *
 * @param incomingBranches - Branch definitions provided in the update payload.
 * @param storedBranches - Currently persisted branch definitions in the repository.
 * @param slug - The seed slug being updated.
 * @param context - The Hono request context.
 * @returns `null` if valid, or a 422 Unprocessable Entity Problem Details Response on rejected destructive changes.
 */
export function validateIncomingBranches(incomingBranches: Branch[], storedBranches: Branch[], slug: string, context: AppContext) {
  assignMissingBranchIds(incomingBranches, storedBranches)
  const storedById = new Map(storedBranches.map((b: Branch) => [b.id, b]))

  for (const branch of incomingBranches) {
    const stored = storedById.get(branch.id)
    if (stored) {
      if (branch.alias !== stored.alias) {
        return publicProblem(context, {
          type: 'alias-rename-not-supported',
          title: 'Alias rename not supported',
          status: 422,
          detail: `Branch '${branch.id}' alias rename from '${stored.alias}' to '${branch.alias}' is irreversible. Use PATCH /api/seeds/${slug}/branches/${branch.id}/rename with a typed confirmation.`,
        })
      }
      if (branch.type !== stored.type) {
        return publicProblem(context, {
          type: 'branch-type-change-not-supported',
          title: 'Branch type change not supported',
          status: 422,
          detail: `Branch '${branch.id}' type change from '${stored.type}' to '${branch.type}' is irreversible. Use PATCH /api/seeds/${slug}/branches/${branch.id}/retype with a typed confirmation.`,
        })
      }
      const relationReasons = relationChangeReasons(stored, branch)
      if (relationReasons.length > 0) {
        return publicProblem(context, {
          type: 'relation-change-not-supported',
          title: 'Relation change not supported',
          status: 422,
          detail: relationReasons.join('; '),
        })
      }
    }
  }
  return null
}

/**
 * Gives every branch that lacks an id the next free `br_NN`.
 *
 * The pool of taken ids is the stored branches plus every explicit id in the request, so a minted id
 * collides with neither a later explicit id nor the id of a stored branch the request omits (a recycled
 * id would let a new definition inherit the physical column of a dropped one).
 */
export function assignMissingBranchIds(branches: Branch[], storedBranches: Branch[] = []): void {
  const taken = [...storedBranches, ...branches.filter(branch => branch.id)]
  for (const branch of branches) {
    if (branch.id) continue
    branch.id = nextBranchId({ branches: taken })
    taken.push(branch)
  }
}
