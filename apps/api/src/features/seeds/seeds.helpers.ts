// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context } from 'hono'
import type { Branch, Seed } from '@beechcms/core'
import {
  nextBranchId,
  validateSeedDefinitions,
  planCreateSeed,
  planExtendSeed,
  SLUG_RE,
  SEED_SLUG_RE,
} from '@beechcms/core'
import { publicProblem, internalErrorDetail } from '../../public/problem-details'
import { deleteR2Objects } from '../../shared/storage/upload'
import { extractMediaKeysFromData } from '../../shared/utils/media-utils'
import type { Env, Variables } from '../../types'

export type AppContext = Context<{ Bindings: Env; Variables: Variables }>

export { SLUG_RE, SEED_SLUG_RE }

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
 * Validates a candidate seed definition against active system seeds and applies additive schema mutations.
 *
 * @remarks
 * 1. Checks relational constraints, duplicate aliases, and format validity across all active seeds.
 * 2. Compares definition against physical database columns (`content_<slug>`).
 * 3. Plans and executes DDL via `planCreateSeed` (new table) or `planExtendSeed` (additive columns).
 * 4. Upserts definition into `SeedRepository` with `'runtime'` source and bumps the registry version for OCC.
 * 5. Dispatches an audit event to the activity logger.
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

  try {
    const stmts = existingCols === null
      ? planCreateSeed(candidate)
      : planExtendSeed(candidate, existingCols).statements
    await schemaMutator.execDdl(stmts)
  } catch (err) {
    return publicProblem(context, {
      type: 'ddl-failed',
      title: 'DDL execution failed',
      status: 422,
      detail: internalErrorDetail(context.env, err),
    })
  }

  await repo.upsert(slug, candidate, 'runtime')
  await repo.bumpRegistryVersion()

  const actor = actorFromContext(context)
  context.get('activityLogger').log({ action, entityType: 'seed', entityId: slug, details: logDetails, actor })

  return null
}

/**
 * Executes destructive DDL statements and persists the updated seed definition.
 *
 * @remarks
 * Used for operations that cannot be planned additively (e.g. column drops, renames, and type conversions).
 * Runs SQL statements through `schemaMutator.execDestructive`, updates the stored definition,
 * increments the schema registry version, and logs the operation.
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
  const schemaMutator = context.get('schemaMutator')

  try {
    await schemaMutator.execDestructive(stmts)
  } catch (err) {
    return publicProblem(context, { type: 'ddl-failed', title: 'DDL failed', status: 422, detail: internalErrorDetail(context.env, err) })
  }

  await repo.upsert(slug, updatedDef, 'runtime')
  await repo.bumpRegistryVersion()

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

/**
 * Validates incoming branches during a definition update (PUT) to reject unconfirmed destructive operations.
 *
 * @remarks
 * Compares incoming branches against stored definitions by ID. If an alias rename or branch type change
 * is detected, rejects the request with a 422 error pointing the caller to dedicated PATCH endpoints.
 * Automatically allocates next sequential branch IDs for any newly appended branches lacking an ID.
 *
 * @param incomingBranches - Branch definitions provided in the update payload.
 * @param storedBranches - Currently persisted branch definitions in the repository.
 * @param slug - The seed slug being updated.
 * @param context - The Hono request context.
 * @returns `null` if valid, or a 422 Unprocessable Entity Problem Details Response on rejected destructive changes.
 */
export function validateIncomingBranches(incomingBranches: Branch[], storedBranches: Branch[], slug: string, context: AppContext) {
  const storedById = new Map(storedBranches.map((b: Branch) => [b.id, b]))

  for (const branch of incomingBranches) {
    const stored = branch.id ? storedById.get(branch.id) : undefined
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
    } else if (!branch.id) {
      const accSeed = { branches: incomingBranches.filter(b => b.id) }
      branch.id = nextBranchId(accSeed)
    }
  }
  return null
}

/**
 * Scans content records of a seed to extract and delete referenced R2 media objects before table deletion.
 *
 * @remarks
 * Gathers all file branches defined on the seed, selects their column values from `content_<slug>`,
 * extracts storage object keys, and deletes them from Cloudflare R2 storage in batches.
 * Any errors encountered during cleanup are treated as non-fatal warnings to allow table drop to proceed.
 *
 * @param context - The Hono request context.
 * @param slug - The seed slug whose media assets are being purged.
 * @param seed - The seed definition containing branch configurations.
 * @param schemaMutator - Schema mutator instance used to query existing database columns.
 */
export async function deleteSeedMediaObjects(context: AppContext, slug: string, seed: Seed, schemaMutator: any) {
  const fileBranches = seed.branches.filter((b: Branch) => b.type === 'file')
  if (fileBranches.length === 0) return

  try {
    const dbCols = await schemaMutator.getColumns(`content_${slug}`)
    if (!dbCols) return

    const validCols = fileBranches.map((b: Branch) => b.alias).filter((a: string) => dbCols.has(a))
    if (validCols.length === 0) return

    const sql = `SELECT ${validCols.join(', ')} FROM content_${slug}`
    const { results: rows } = await context.env.DB.prepare(sql).all()
    const cdnUrl = context.env.MEDIA_CDN_URL
    const r2Keys: string[] = []
    
    for (const row of rows) {
      for (const b of fileBranches) {
        const val = row[b.alias]
        if (!val) continue
        const keys = extractMediaKeysFromData(seed, { [b.alias]: val }, cdnUrl)
        r2Keys.push(...keys)
      }
    }
    
    if (r2Keys.length > 0) {
      await deleteR2Objects(context, r2Keys).catch((error: unknown) => {
        console.warn(`Seed drop for '${slug}' left media rows out of sync:`, error)
      })
    }
  } catch { /* non-fatal: drop proceeds */ }
}
