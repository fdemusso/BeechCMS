// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Branch, Seed } from '@beechcms/core'
import {
  nextBranchId,
  validateSeedDefinitions,
  planCreateSeed,
  planExtendSeed,
  planFtsRebuild,
  generateDropTable,
  generateDropColumn,
  generateRenameColumn,
  generateRetypeColumn,
  BRANCH_ALIAS_RE,
} from '@beechcms/core'
import { publicProblem, internalErrorDetail } from '../../public/problem-details'
import { deleteR2Objects } from '../../shared/storage/upload'
import { extractMediaKeysFromData } from '../../shared/utils/media-utils'
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

async function parseJsonBody(context: any): Promise<unknown> {
  try { return await context.req.json() } catch {
    return publicProblem(context, { type: 'invalid-json', title: 'Invalid JSON', status: 400, detail: 'Body must be valid JSON.' })
  }
}

async function getActiveSeed(context: any, slug: string) {
  const repo = context.get('seedRepository')
  const existing = await repo.get(slug)
  if (!existing || existing.status === 'deleted') {
    return publicProblem(context, { type: 'seed-not-found', title: 'Seed not found', status: 404, detail: `No active seed with slug '${slug}'.` })
  }
  return existing
}

async function validateAndApplySeedDef(context: any, slug: string, candidate: Seed, action: 'create' | 'update', logDetails: any) {
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

async function applyDestructiveSeedDef(context: any, slug: string, updatedDef: Seed, stmts: string[], logDetails: any) {
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

/** Typed confirm guard. Returns a 400 response on mismatch, null on success. */
function requireConfirm(context: any, expected: string, body: unknown) {
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

function validateIncomingBranches(incomingBranches: Branch[], storedBranches: Branch[], slug: string, context: any) {
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

async function deleteSeedMediaObjects(context: any, slug: string, seed: Seed, schemaMutator: any) {
  const fileBranches = seed.branches.filter((b: Branch) => b.type === 'file')
  if (fileBranches.length === 0) return

  try {
    const dbCols = await schemaMutator.getColumns(`content_${slug}`)
    if (!dbCols) return

    const validCols = fileBranches.map((b: Branch) => b.alias).filter((a: string) => dbCols.has(a))
    if (validCols.length === 0) return

    const sql = `SELECT ${validCols.join(', ')} FROM content_${slug}`
    const { results: rows } = await context.env.DB.prepare(sql).all()
    const r2Keys: string[] = []
    
    for (const row of rows) {
      for (const b of fileBranches) {
        const val = row[b.alias]
        if (!val) continue
        const keys = extractMediaKeysFromData(seed, { [b.alias]: val })
        r2Keys.push(...keys)
      }
    }
    
    if (r2Keys.length > 0) {
      await deleteR2Objects(context, r2Keys).catch(() => { /* non-fatal */ })
    }
  } catch { /* non-fatal: drop proceeds */ }
}

export const seedsApp = new Hono<{ Bindings: Env; Variables: Variables }>()

seedsApp.use('*', async (context, next) => {
  const denied = requireAdmin(context)
  if (denied) return denied
  await next()
})

/** GET /api/seeds — list all seed records (active + deleted). Admin-only. */
seedsApp.get('/', async (context) => {
  const records = await context.get('seedRepository').listAll()
  return context.json(records)
})

/** GET /api/seeds/:slug — single record by slug. Admin-only. */
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

/** POST /api/seeds — create a new content type. */
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

/** PUT /api/seeds/:slug — replace definition (additive-only). */
seedsApp.put('/:slug', async (context) => {
  const slug = context.req.param('slug')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

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

/** POST /api/seeds/:slug/branches — add a single branch. */
seedsApp.post('/:slug/branches', async (context) => {
  const slug = context.req.param('slug')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

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

/** DELETE /api/seeds/:slug — soft-delete a content type. */
seedsApp.delete('/:slug', async (context) => {
  const slug = context.req.param('slug')
  const repo = context.get('seedRepository')
  
  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

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

/** GET /api/seeds/:slug/orphans — columns in DB but absent from the definition. */
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

/** POST /api/seeds/:slug/fts/rebuild — rebuild FTS table + triggers. */
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

/** DELETE /api/seeds/:slug/hard — hard delete: drops tables + deletes row. */
seedsApp.delete('/:slug/hard', async (context) => {
  const slug = context.req.param('slug')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const confirmErr = requireConfirm(context, slug, body)
  if (confirmErr) return confirmErr

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

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

  const repo = context.get('seedRepository')
  const schemaMutator = context.get('schemaMutator')
  const seed = existing.definition

  await deleteSeedMediaObjects(context, slug, seed, schemaMutator)

  await schemaMutator.execDestructive(generateDropTable(seed))
  await repo.hardDelete(slug)
  await repo.bumpRegistryVersion()

  const actor = actorFromContext(context)
  context.get('activityLogger').log({ action: 'delete', entityType: 'seed', entityId: slug, details: { op: 'hard-delete', slug }, actor })

  return context.json({ success: true })
})

/** DELETE /api/seeds/:slug/branches/:branchId — drop a single field column. */
seedsApp.delete('/:slug/branches/:branchId', async (context) => {
  const slug = context.req.param('slug')
  const branchId = context.req.param('branchId')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

  const branch = existing.definition.branches.find((b: Branch) => b.id === branchId)
  if (!branch) {
    return publicProblem(context, { type: 'branch-not-found', title: 'Branch not found', status: 404, detail: `No branch with id '${branchId}' in seed '${slug}'.` })
  }

  const confirmErr = requireConfirm(context, `${slug}.${branch.alias}`, body)
  if (confirmErr) return confirmErr

  const updatedDef: Seed = {
    ...existing.definition,
    branches: existing.definition.branches.filter((b: Branch) => b.id !== branchId),
  }

  const stmts = generateDropColumn(existing.definition, branch.alias)
  const error = await applyDestructiveSeedDef(context, slug, updatedDef, stmts, { op: 'drop-branch', branchId, alias: branch.alias })
  if (error) return error

  return context.json({ success: true })
})

/** PATCH /api/seeds/:slug/branches/:branchId/rename — rename a field alias. */
seedsApp.patch('/:slug/branches/:branchId/rename', async (context) => {
  const slug = context.req.param('slug')
  const branchId = context.req.param('branchId')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const newAlias = (body as Record<string, unknown>)?.newAlias
  if (typeof newAlias !== 'string' || !BRANCH_ALIAS_RE.test(newAlias)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `newAlias must match ${BRANCH_ALIAS_RE.source} (lowercase letter followed by alphanumeric characters or underscores).` })
  }

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

  const branch = existing.definition.branches.find((b: Branch) => b.id === branchId)
  if (!branch) {
    return publicProblem(context, { type: 'branch-not-found', title: 'Branch not found', status: 404, detail: `No branch with id '${branchId}' in seed '${slug}'.` })
  }

  const confirmErr = requireConfirm(context, `${slug}.${branch.alias}`, body)
  if (confirmErr) return confirmErr

  const renamedDef: Seed = {
    ...existing.definition,
    branches: existing.definition.branches.map((b: Branch) =>
      b.id === branchId ? { ...b, alias: newAlias } : b
    ),
  }

  const renameStmts = generateRenameColumn(existing.definition, branch.alias, newAlias)
  const ftsStmts = planFtsRebuild(renamedDef)
  
  const error = await applyDestructiveSeedDef(context, slug, renamedDef, [...renameStmts, ...ftsStmts], { op: 'rename-branch', branchId, from: branch.alias, to: newAlias })
  if (error) return error

  let affectedAutomations: string[] = []
  try {
    const automationRepo = context.get('automationRepository')
    if (automationRepo) {
      const automations = await automationRepo.list(slug)
      const oldAlias = branch.alias
      affectedAutomations = automations
        .filter((a: any) => JSON.stringify(a).includes(oldAlias))
        .map((a: any) => a.id)
    }
  } catch { /* non-fatal */ }

  return context.json({ success: true, affectedAutomations })
})

/** PATCH /api/seeds/:slug/branches/:branchId/retype — change field SQL type. */
seedsApp.patch('/:slug/branches/:branchId/retype', async (context) => {
  const slug = context.req.param('slug')
  const branchId = context.req.param('branchId')
  const body = await parseJsonBody(context)
  if (body instanceof Response) return body

  const newType = (body as Record<string, unknown>)?.newType
  const VALID_TYPES = new Set(['text','number','boolean','date','json','richtext','file','tags','relation','repeater'])
  if (typeof newType !== 'string' || !VALID_TYPES.has(newType)) {
    return publicProblem(context, { type: 'invalid-json', title: 'Bad Request', status: 400, detail: `newType must be one of: ${[...VALID_TYPES].join(', ')}.` })
  }

  const existing = await getActiveSeed(context, slug)
  if (existing instanceof Response) return existing

  const branch = existing.definition.branches.find((b: Branch) => b.id === branchId)
  if (!branch) {
    return publicProblem(context, { type: 'branch-not-found', title: 'Branch not found', status: 404, detail: `No branch with id '${branchId}' in seed '${slug}'.` })
  }

  if (branch.type === 'repeater' || newType === 'repeater') {
    return publicProblem(context, {
      type: 'retype-not-supported',
      title: 'Retype not supported',
      status: 422,
      detail: "Retyping to or from 'repeater' is not supported in v1.",
    })
  }

  const confirmErr = requireConfirm(context, `${slug}.${branch.alias}`, body)
  if (confirmErr) return confirmErr

  const retypedBranch: Branch = { ...branch, type: newType as Branch['type'] }
  const retypedDef: Seed = {
    ...existing.definition,
    branches: existing.definition.branches.map((b: Branch) => b.id === branchId ? retypedBranch : b),
  }

  const retypeStmts = generateRetypeColumn(existing.definition, retypedBranch)
  const ftsStmts = planFtsRebuild(retypedDef)

  const error = await applyDestructiveSeedDef(context, slug, retypedDef, [...retypeStmts, ...ftsStmts], { op: 'retype-branch', branchId, from: branch.type, to: newType })
  if (error) return error

  return context.json({ success: true })
})
