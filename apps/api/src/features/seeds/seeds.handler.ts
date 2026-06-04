// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Branch, Seed } from '@beechcms/core'
import { nextBranchId, validateSeedDefinitions, planCreateSeed, planExtendSeed } from '@beechcms/core'
import { publicProblem, internalErrorDetail } from '../../public/problem-details'
import type { Env, Variables } from '../../types'

const SLUG_RE = /^[a-z0-9_]+$/

function requireAdmin(context: any) {
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

function actorFromContext(context: any) {
  const jwt = context.get('jwtPayload')
  return {
    id: jwt?.sub ?? 'unknown',
    email: jwt?.email ?? 'unknown',
    name: [jwt?.name, jwt?.surname].filter(Boolean).join(' ') || null,
  }
}

/** Assign ids to branches that are missing one, mutates each branch in place. */
function assignBranchIds(branches: Branch[], accSeed: Pick<Seed, 'branches'>): void {
  for (const branch of branches) {
    if (!branch.id) {
      branch.id = nextBranchId(accSeed)
      ;(accSeed.branches as Branch[]).push(branch)
    }
  }
}

export const seedsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/** GET /api/seeds — list all seed records (active + deleted). Admin-only. */
seedsApp.get('/', async (context) => {
  const denied = requireAdmin(context)
  if (denied) return denied
  const records = await context.get('seedRepository').listAll()
  return context.json(records)
})

/** GET /api/seeds/:slug — single record by slug. Admin-only. */
seedsApp.get('/:slug', async (context) => {
  const denied = requireAdmin(context)
  if (denied) return denied
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

/** POST /api/seeds — create a new content type. */
seedsApp.post('/', async (context) => {
  const denied = requireAdmin(context)
  if (denied) return denied

  let body: unknown
  try { body = await context.req.json() } catch {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be valid JSON.' })
  }

  const candidate = body as Seed
  const slug = candidate?.slug

  if (!slug || !SLUG_RE.test(slug)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `slug must match ${SLUG_RE.source}.` })
  }

  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)

  if (existing && existing.status === 'active') {
    return publicProblem(context, {
      type: 'slug-conflict',
      title: 'Slug conflict',
      status: 409,
      detail: `An active seed with slug '${slug}' already exists.`,
    })
  }
  // If deleted, treat as revive+replace (upsert reactivates). Content table reused (additive).

  // Assign ids to branches that are missing one
  const accSeed: Pick<Seed, 'branches'> = { branches: [] }
  const branches: Branch[] = Array.isArray(candidate.branches) ? candidate.branches : []
  for (const branch of branches) {
    if (!branch.id) {
      branch.id = nextBranchId(accSeed)
    }
    ;(accSeed.branches as Branch[]).push({ ...branch })
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

  // Validate against full active set
  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter(s => s.slug !== slug), candidate]
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

  // Order: validate → execDdl → upsert → bump → log
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
  context.get('activityLogger').log({ action: 'create', entityType: 'seed', entityId: slug, details: { slug }, actor })

  return context.json({ slug }, 201)
})

/** PUT /api/seeds/:slug — replace definition (additive-only). */
seedsApp.put('/:slug', async (context) => {
  const denied = requireAdmin(context)
  if (denied) return denied

  const slug = context.req.param('slug')
  let body: unknown
  try { body = await context.req.json() } catch {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be valid JSON.' })
  }

  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)
  if (!existing || existing.status === 'deleted') {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No active seed with slug '${slug}'.` })
  }

  const incoming = body as Seed
  const storedBranches = existing.definition.branches
  const incomingBranches: Branch[] = Array.isArray(incoming.branches) ? incoming.branches : []

  // Build map of stored branches by id
  const storedById = new Map(storedBranches.map(b => [b.id, b]))

  for (const branch of incomingBranches) {
    const stored = branch.id ? storedById.get(branch.id) : undefined
    if (stored) {
      // Alias rename check (same id, different alias)
      if (branch.alias !== stored.alias) {
        return publicProblem(context, {
          type: 'alias-rename-not-supported',
          title: 'Alias rename not supported',
          status: 422,
          detail: `Branch '${branch.id}' alias rename from '${stored.alias}' to '${branch.alias}' is not supported in this version (sprint 06).`,
        })
      }
      // Type change check
      if (branch.type !== stored.type) {
        return publicProblem(context, {
          type: 'branch-type-change-not-supported',
          title: 'Branch type change not supported',
          status: 422,
          detail: `Branch '${branch.id}' type change from '${stored.type}' to '${branch.type}' is not supported (sprint 06).`,
        })
      }
    } else if (!branch.id) {
      // New branch — assign id
      const accSeed = { branches: incomingBranches.filter(b => b.id) }
      branch.id = nextBranchId(accSeed)
    }
  }

  const candidate: Seed = { ...incoming, slug, branches: incomingBranches }

  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter(s => s.slug !== slug), candidate]
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
  context.get('activityLogger').log({ action: 'update', entityType: 'seed', entityId: slug, details: { slug }, actor })

  return context.json({ slug })
})

/** POST /api/seeds/:slug/branches — add a single branch. */
seedsApp.post('/:slug/branches', async (context) => {
  const denied = requireAdmin(context)
  if (denied) return denied

  const slug = context.req.param('slug')
  let body: unknown
  try { body = await context.req.json() } catch {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be valid JSON.' })
  }

  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)
  if (!existing || existing.status === 'deleted') {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No active seed with slug '${slug}'.` })
  }

  const newBranch = body as Branch
  newBranch.id = nextBranchId(existing.definition)

  const candidate: Seed = {
    ...existing.definition,
    branches: [...existing.definition.branches, newBranch],
  }

  const activeSeeds = await repo.listActive()
  const candidateSet = [...activeSeeds.filter(s => s.slug !== slug), candidate]
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
  context.get('activityLogger').log({ action: 'update', entityType: 'seed', entityId: slug, details: { addedBranch: newBranch.id }, actor })

  return context.json({ id: newBranch.id })
})

/** DELETE /api/seeds/:slug — soft-delete a content type. */
seedsApp.delete('/:slug', async (context) => {
  const denied = requireAdmin(context)
  if (denied) return denied

  const slug = context.req.param('slug')
  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)

  if (!existing || existing.status === 'deleted') {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No active seed with slug '${slug}'.` })
  }

  // Backref guard: reject if other active seeds reference this slug via relation branches
  const backrefMap = context.get('backrefMap')
  const inbound = backrefMap.get(slug)
  if (inbound && inbound.length > 0) {
    const referencers = [...new Set(inbound.map((r: { seedSlug: string }) => r.seedSlug))]
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
