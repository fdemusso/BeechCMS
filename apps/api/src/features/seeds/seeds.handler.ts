// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module features/seeds
 *
 * HTTP route handlers for Seed and Schema Management in BeechCMS.
 *
 * Provides RESTful administration endpoints for Content Types ("Seeds"),
 * executing additive DDL migrations against SQLite/D1, managing branches (fields),
 * rebuilding full-text search (FTS5) virtual tables, and composing sub-routers
 * for destructive operations and MCP agent workflows.
 */

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Branch, Seed } from '@beechcms/core'
import { nextBranchId, planFtsRebuild } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Env, Variables } from '../../types'
import {
  SLUG_RE,
  requireAdmin,
  actorFromContext,
  parseJsonBody,
  getActiveSeed,
  rejectManifestOwned,
  validateAndApplySeedDef,
  validateIncomingBranches,
} from './seeds.helpers'
import { destructiveApp } from './seeds.destructive'
import { mcpApp } from './seeds.mcp'

export const seedsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Global router middleware enforcing admin-only access on all seed management endpoints.
 */
seedsApp.use('*', async (context, next) => {
  const denied = requireAdmin(context)
  if (denied) return denied
  await next()
})

/**
 * Mount sub-routers for destructive column/table operations and MCP agent tooling.
 */
seedsApp.route('/', destructiveApp)
seedsApp.route('/', mcpApp)

/**
 * Lists all seed records (both active and soft-deleted).
 *
 * @remarks
 * Admin-only. Emits the current `X-Schema-Version` response header carrying `seed_meta.registry_version`
 * for optimistic concurrency control (OCC) aware clients.
 *
 * @route GET /api/seeds
 * @returns 200 OK with an array of seed records.
 */
seedsApp.get('/', async (context) => {
  const repo = context.get('seedRepository')
  const records = await repo.listAll()
  context.header('X-Schema-Version', String(await repo.getRegistryVersion()))
  return context.json(records)
})

/**
 * Retrieves a single seed record by slug.
 *
 * @remarks
 * Admin-only. Returns the complete seed record including definition, status, and audit metadata.
 *
 * @route GET /api/seeds/:slug
 * @param slug - Seed slug identifier.
 * @returns 200 OK with the seed record, or 404 Problem Details if not found.
 */
seedsApp.get('/:slug', async (context) => {
  const slug = context.req.param('slug')
  const record = await context.get('seedRepository').get(slug)
  if (!record) {
    return publicProblem(context, {
      type: 'seed-not-found',
      title: 'Seed not found',
      status: 404,
      detail: `No seed with slug '${slug}'.`,
    })
  }
  return context.json(record)
})

/**
 * Creates a new content type (Seed) and initializes its physical database table and FTS index.
 *
 * @remarks
 * - Enforces lowercase alphanumeric/underscore format on `slug`.
 * - Rejects conflicting active seeds with 409 Conflict.
 * - Generates sequential IDs (`b1`, `b2`, ...) for branches lacking explicit IDs.
 * - Infers `displayNameAlias` from the first text branch if not explicitly provided.
 * - Validates seed definitions across the full active set (e.g. cross-seed relations).
 * - Executes DDL to create physical table `content_<slug>` and FTS5 virtual table/triggers.
 * - Registers the seed in `SeedRepository` and records an activity log entry.
 *
 * @route POST /api/seeds
 * @returns 201 Created with `{ slug }`, or 400/409/422 Problem Details on error.
 */
seedsApp.post('/', async (context) => {
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const candidate = body as Seed
  const slug = candidate?.slug

  if (!slug || !SLUG_RE.test(slug)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `slug must match ${SLUG_RE.source}.` })
  }

  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)

  if (existing?.status === 'active') {
    return publicProblem(context, {
      type: 'slug-conflict',
      title: 'Slug conflict',
      status: 409,
      detail: `An active seed with slug '${slug}' already exists.`,
    })
  }

  // Assign ids to branches that are missing one
  const accSeed: Pick<Seed, 'branches'> = { branches: [] }
  const branches: Branch[] = Array.isArray(candidate.branches) ? candidate.branches : []
  for (const branch of branches) {
    if (!branch.id) {
      branch.id = nextBranchId(accSeed)
    }
    accSeed.branches.push({ ...branch })
  }

  // Default displayNameAlias to first text branch if not provided
  if (!candidate.displayNameAlias) {
    const firstText = branches.find(b => b.type === 'text')
    if (!firstText) {
      return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: 'displayNameAlias is required (or include at least one text branch so it can be inferred).' })
    }
    candidate.displayNameAlias = firstText.alias
  }
  candidate.branches = branches

  const error = await validateAndApplySeedDef(context, slug, candidate, 'create', { slug })
  if (error) return error

  return context.json({ slug }, 201)
})

/**
 * Updates an existing seed definition (additive-only).
 *
 * @remarks
 * Replaces the stored seed definition with candidate branches while disallowing silent column drops,
 * alias renames, or type changes. Generates and executes additive DDL (`ADD COLUMN`) for new branches.
 *
 * @route PUT /api/seeds/:slug
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ slug }`, or 400/404/422 Problem Details on error.
 */
seedsApp.put('/:slug', async (context) => {
  const slug = context.req.param('slug')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing
  const owned = rejectManifestOwned(context, existing)
  if (owned) return owned

  const incoming = body as Seed
  const storedBranches = existing.definition.branches
  const incomingBranches: Branch[] = Array.isArray(incoming.branches) ? incoming.branches : []

  const validationError = validateIncomingBranches(incomingBranches, storedBranches, slug, context)
  if (validationError) return validationError

  const candidate: Seed = { ...incoming, slug, branches: incomingBranches }

  const error = await validateAndApplySeedDef(context, slug, candidate, 'update', { slug })
  if (error) return error

  return context.json({ slug })
})

/**
 * Appends a single new branch (field) to an existing seed definition.
 *
 * @remarks
 * Automatically generates a unique sequential branch ID (`nextBranchId`), validates the updated
 * candidate definition against active seeds, applies additive DDL (`ALTER TABLE ... ADD COLUMN`),
 * increments registry version, and logs activity.
 *
 * @route POST /api/seeds/:slug/branches
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ id: string }` representing the new branch ID, or 400/404/422 Problem Details on error.
 */
seedsApp.post('/:slug/branches', async (context) => {
  const slug = context.req.param('slug')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing
  const owned = rejectManifestOwned(context, existing)
  if (owned) return owned

  const newBranch = body as Branch
  newBranch.id = nextBranchId(existing.definition)

  const candidate: Seed = {
    ...existing.definition,
    branches: [...existing.definition.branches, newBranch],
  }

  const error = await validateAndApplySeedDef(context, slug, candidate, 'update', { addedBranch: newBranch.id })
  if (error) return error

  return context.json({ id: newBranch.id })
})

/**
 * Soft-deletes a content type (Seed).
 *
 * @remarks
 * Sets seed status to `'deleted'`. Refuses deletion with 409 Conflict if other active seeds
 * hold inbound relation branches pointing to this seed.
 *
 * @route DELETE /api/seeds/:slug
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ success: true }`, or 404/409 Problem Details on error.
 */
seedsApp.delete('/:slug', async (context) => {
  const slug = context.req.param('slug')
  const repo = context.get('seedRepository')
  
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing
  const owned = rejectManifestOwned(context, existing)
  if (owned) return owned

  const backrefMap = context.get('backrefMap')
  const inbound = backrefMap.get(slug)
  if (inbound && inbound.length > 0) {
    const referencers = [...new Set(inbound.map((r: any) => r.sourceSlug))]
    return publicProblem(context, {
      type: 'seed-referenced',
      title: 'Seed referenced',
      status: 409,
      detail: `Seed '${slug}' is referenced by: ${referencers.join(', ')}. Remove those relations first.`,
    })
  }

  await repo.softDelete(slug)
  await repo.bumpRegistryVersion()

  const actor = actorFromContext(context)
  context.get('activityLogger').log({ action: 'delete', entityType: 'seed', entityId: slug, details: { slug }, actor })

  return context.json({ success: true })
})

/**
 * Identifies orphaned database columns that exist in the physical table but are absent from the seed definition.
 *
 * @remarks
 * Compares physical SQLite table columns (`content_<slug>`) against known system columns
 * (`id`, `slug`, `status`, `created_at`, `updated_at`) and defined branch aliases.
 *
 * @route GET /api/seeds/:slug/orphans
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ orphans: string[] }`, or 404 Problem Details if seed not found.
 */
seedsApp.get('/:slug/orphans', async (context) => {
  const slug = context.req.param('slug')
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

  const schemaMutator = context.get('schemaMutator')
  const dbCols = await schemaMutator.getColumns(`content_${slug}`)
  if (!dbCols) return context.json({ orphans: [] })

  const knownAliases = new Set([
    'id', 'slug', 'status', 'created_at', 'updated_at',
    ...existing.definition.branches
      .filter((b: Branch) => !(b.type === 'relation' && b.multiple === true))
      .map((b: Branch) => b.alias),
  ])
  const orphans = [...dbCols].filter((col: string) => !knownAliases.has(col))
  return context.json({ orphans })
})

/**
 * Rebuilds the FTS5 virtual table and synchronization triggers for a seed.
 *
 * @remarks
 * Executes destructive DDL to drop and recreate the FTS5 virtual table and `content_<slug>`
 * insert/update/delete triggers, ensuring full-text search indexing is in sync with current text branches.
 *
 * @route POST /api/seeds/:slug/fts/rebuild
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ success: true }`, or 404/422 Problem Details on error.
 */
seedsApp.post('/:slug/fts/rebuild', async (context) => {
  const slug = context.req.param('slug')
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

  const stmts = planFtsRebuild(existing.definition)
  if (stmts.length > 0) {
    await context.get('schemaMutator').execDestructive(stmts)
  }

  const actor = actorFromContext(context)
  context.get('activityLogger').log({ action: 'update', entityType: 'seed', entityId: slug, details: { op: 'fts-rebuild' }, actor })

  return context.json({ success: true })
})

export { McpClassification, classifyCandidate } from './seeds.mcp'
export * from './seeds.helpers'
export { destructiveApp } from './seeds.destructive'
export { mcpApp } from './seeds.mcp'
