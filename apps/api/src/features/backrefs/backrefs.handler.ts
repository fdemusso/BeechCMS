// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import { Hono } from 'hono'
import { resolvePolicies } from '@beechcms/core'
import { publicProblem } from '../../public/problem-details'
import type { AppEnv } from '../../types'

const PREVIEW_LIMIT = 3
const DEFAULT_PAGE_LIMIT = 20
const MAX_PAGE_LIMIT = 100

export const backrefsApp = new Hono<AppEnv>()

// ---------------------------------------------------------------------------
// GET /content/:targetSlug/:targetId/backrefs
// ---------------------------------------------------------------------------

backrefsApp.get('/:targetSlug/:targetId/backrefs', async (c) => {
  const targetSlug = c.req.param('targetSlug')
  const targetId = c.req.param('targetId')
  const groupParam = c.req.query('group')      // '<sourceSlug>:<branchAlias>'
  const pageParam = c.req.query('page')
  const limitParam = c.req.query('limit')

  const db = c.env.DB
  const getSeed = c.get('getSeed')
  const backrefMap = c.get('backrefMap')

  // 1. Resolve target seed
  const targetSeed = getSeed(targetSlug)
  if (!targetSeed) {
    return publicProblem(c, {
      type: 'not-found',
      title: 'Not Found',
      status: 404,
      detail: `Seed '${targetSlug}' does not exist`,
    })
  }

  // 2. Verify targetId exists in content_<targetSlug>
  const existsRow = await db
    .prepare(`SELECT id FROM content_${targetSlug} WHERE id = ? LIMIT 1`)
    .bind(targetId)
    .first<{ id: string }>()

  if (!existsRow) {
    return publicProblem(c, {
      type: 'not-found',
      title: 'Not Found',
      status: 404,
      detail: `Entry '${targetId}' not found in '${targetSlug}'`,
    })
  }

  // 3. Get sources for this target
  const sources = backrefMap.get(targetSlug)
  if (!sources || sources.length === 0) {
    return c.json({ groups: [] })
  }

  // 4. Pagination
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const rawLimit = parseInt(limitParam ?? String(DEFAULT_PAGE_LIMIT), 10) || DEFAULT_PAGE_LIMIT
  const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_LIMIT)
  const offset = (page - 1) * limit

  // 5. Paginated single-group request
  if (groupParam) {
    const colonIdx = groupParam.indexOf(':')
    if (colonIdx === -1) {
      return publicProblem(c, {
        type: 'bad-request',
        title: 'Bad Request',
        status: 400,
        detail: `'group' must be '<sourceSlug>:<branchAlias>'`,
      })
    }
    const sourceSlug = groupParam.slice(0, colonIdx)
    const branchAlias = groupParam.slice(colonIdx + 1)

    const source = sources.find(
      s => s.sourceSlug === sourceSlug && s.branchAlias === branchAlias
    )
    if (!source) {
      return publicProblem(c, {
        type: 'not-found',
        title: 'Not Found',
        status: 404,
        detail: `Back-ref group '${groupParam}' not found for target '${targetSlug}'`,
      })
    }

    const sourceSeed = getSeed(sourceSlug)
    if (!sourceSeed) {
      return c.json({ groups: [] })
    }

    const { items, total } = await queryGroup({
      db,
      source,
      sourceSeed,
      targetId,
      limit,
      offset,
    })

    const filteredItems = filterVisibility(items, sourceSeed)

    return c.json({
      groups: [{
        sourceSlug: source.sourceSlug,
        sourceLabel: sourceSeed.labelPlural ?? sourceSeed.label,
        branchAlias: source.branchAlias,
        branchLabel: source.branchLabel,
        relationship: source.relationship,
        restricts: source.restricts,
        total,
        items: filteredItems,
      }],
    })
  }

  // 6. Preview mode — all groups, PREVIEW_LIMIT each
  const groupResults = await Promise.all(
    sources.map(async (source) => {
      const sourceSeed = getSeed(source.sourceSlug)
      if (!sourceSeed) return null

      const { items, total } = await queryGroup({
        db,
        source,
        sourceSeed,
        targetId,
        limit: PREVIEW_LIMIT,
        offset: 0,
      })

      const filteredItems = filterVisibility(items, sourceSeed)

      return {
        sourceSlug: source.sourceSlug,
        sourceLabel: sourceSeed.labelPlural ?? sourceSeed.label,
        branchAlias: source.branchAlias,
        branchLabel: source.branchLabel,
        relationship: source.relationship,
        restricts: source.restricts,
        total,
        items: filteredItems,
      }
    })
  )

  const groups = groupResults.filter(
    (g): g is NonNullable<typeof g> => g !== null && g.total > 0
  )

  return c.json({ groups })
})

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface BackrefItem {
  id: string
  displayName: string | null
  status: string
  updated_at: number | null
}

interface QueryGroupResult {
  items: BackrefItem[]
  total: number
}

interface QueryGroupParams {
  db: D1Database
  source: import('@beechcms/core').BackrefSource
  sourceSeed: import('@beechcms/core').Seed
  targetId: string
  limit: number
  offset: number
}

async function queryGroup({
  db,
  source,
  sourceSeed,
  targetId,
  limit,
  offset,
}: QueryGroupParams): Promise<QueryGroupResult> {
  const displayCol = sourceSeed.displayNameAlias

  if (source.relationship === 'single') {
    const [rowsResult, countResult] = await Promise.all([
      db
        .prepare(
          `SELECT id, status, updated_at, ${displayCol} AS displayName
             FROM content_${source.sourceSlug}
            WHERE ${source.branchAlias} = ?
            ORDER BY updated_at DESC
            LIMIT ? OFFSET ?`
        )
        .bind(targetId, limit, offset)
        .all<BackrefItem>(),
      db
        .prepare(
          `SELECT COUNT(*) AS total FROM content_${source.sourceSlug} WHERE ${source.branchAlias} = ?`
        )
        .bind(targetId)
        .first<{ total: number }>(),
    ])

    return {
      items: rowsResult.results ?? [],
      total: countResult?.total ?? 0,
    }
  }

  // multi — join table: rel_<sourceSlug>_<branchAlias>
  const joinTable = `rel_${source.sourceSlug}_${source.branchAlias}`
  const [rowsResult, countResult] = await Promise.all([
    db
      .prepare(
        `SELECT c.id, c.status, c.updated_at, c.${displayCol} AS displayName
           FROM content_${source.sourceSlug} c
           JOIN ${joinTable} r ON r.parent_id = c.id
          WHERE r.target_id = ?
          ORDER BY c.updated_at DESC
          LIMIT ? OFFSET ?`
      )
      .bind(targetId, limit, offset)
      .all<BackrefItem>(),
    db
      .prepare(
        `SELECT COUNT(DISTINCT parent_id) AS total FROM ${joinTable} WHERE target_id = ?`
      )
      .bind(targetId)
      .first<{ total: number }>(),
  ])

  return {
    items: rowsResult.results ?? [],
    total: countResult?.total ?? 0,
  }
}

function filterVisibility(
  items: BackrefItem[],
  sourceSeed: import('@beechcms/core').Seed
): BackrefItem[] {
  // Apply visibility policy to displayName field only.
  // Other returned fields (id, status, updated_at) are system fields, always visible.
  const displayBranch = sourceSeed.branches.find(
    b => b.alias === sourceSeed.displayNameAlias
  )
  if (!displayBranch) return items

  const { visibility } = resolvePolicies(displayBranch)
  if (visibility === 'hidden') {
    return items.map(item => ({ ...item, displayName: null }))
  }
  if (visibility === 'masked') {
    return items.map(item => ({
      ...item,
      displayName: item.displayName ? '••••••••' : null,
    }))
  }
  return items
}
