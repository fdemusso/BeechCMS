// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import type { Branch, Seed } from '@beechcms/core'
import {
  generateDropTable,
  generateDropColumn,
  generateRenameColumn,
  generateRetypeColumn,
  planFtsRebuild,
  BRANCH_ALIAS_RE,
} from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { Env, Variables } from '../../types'
import {
  parseJsonBody,
  requireConfirm,
  getActiveSeed,
  deleteSeedMediaObjects,
  applyDestructiveSeedDef,
  actorFromContext,
} from './seeds.helpers'

export const destructiveApp = new Hono<{ Bindings: Env; Variables: Variables }>()

/**
 * Permanently hard-deletes a content type, dropping physical tables and associated R2 media assets.
 *
 * @remarks
 * Irreversible destructive operation.
 * - Requires body `{ confirm: slug }`.
 * - Checks backref graph and rejects with 409 Conflict if referenced by other active seeds.
 * - Deletes all R2 media objects referenced in file columns.
 * - Drops physical content table `content_<slug>` and FTS tables.
 * - Removes seed record permanently from `SeedRepository`.
 *
 * @route DELETE /api/seeds/:slug/hard
 * @param slug - Seed slug identifier.
 * @returns 200 OK with `{ success: true }`, or 400/404/409/422 Problem Details on error.
 */
destructiveApp.delete('/:slug/hard', async (context) => {
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

/**
 * Drops a single branch (column) from a seed and its database table.
 *
 * @remarks
 * Irreversible destructive operation.
 * - Requires body `{ confirm: "<slug>.<alias>" }`.
 * - Generates and applies destructive DDL (`generateDropColumn`).
 * - Updates the seed definition in `SeedRepository` and bumps the registry version.
 *
 * @route DELETE /api/seeds/:slug/branches/:branchId
 * @param slug - Seed slug identifier.
 * @param branchId - Unique branch identifier.
 * @returns 200 OK with `{ success: true }`, or 400/404/422 Problem Details on error.
 */
destructiveApp.delete('/:slug/branches/:branchId', async (context) => {
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

/**
 * Renames a branch alias (column name) within a seed.
 *
 * @remarks
 * Irreversible destructive operation.
 * - Requires body `{ newAlias: string, confirm: "<slug>.<alias>" }`.
 * - Validates `newAlias` against `BRANCH_ALIAS_RE`.
 * - Generates rename column DDL and FTS rebuild statements.
 * - Scans automations repository for references to the old alias and returns affected automation IDs.
 *
 * @route PATCH /api/seeds/:slug/branches/:branchId/rename
 * @param slug - Seed slug identifier.
 * @param branchId - Unique branch identifier.
 * @returns 200 OK with `{ success: true, affectedAutomations: string[] }`, or 400/404/422 Problem Details on error.
 */
destructiveApp.patch('/:slug/branches/:branchId/rename', async (context) => {
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

/**
 * Retypes an existing branch to a different data type.
 *
 * @remarks
 * Irreversible destructive operation.
 * - Validates `newType` against supported types (`text`, `number`, `boolean`, `date`, `json`, `richtext`, `file`, `tags`, `relation`, `repeater`).
 * - Rejects retyping to or from `'repeater'`.
 * - Requires body `{ newType: string, confirm: "<slug>.<alias>" }`.
 * - Generates column retyping DDL and rebuilds FTS.
 *
 * @route PATCH /api/seeds/:slug/branches/:branchId/retype
 * @param slug - Seed slug identifier.
 * @param branchId - Unique branch identifier.
 * @returns 200 OK with `{ success: true }`, or 400/404/422 Problem Details on error.
 */
destructiveApp.patch('/:slug/branches/:branchId/retype', async (context) => {
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
