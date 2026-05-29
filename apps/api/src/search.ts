// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// apps/api/src/search.ts

import { Hono }              from "hono"
import type { Env, Variables } from "./types"
import { authMiddleware }    from "./middleware"
import {
  encodeCursor,
  mapSearchResultRow,
  type SearchResponse,
} from "./search-utils"

export const searchRouter = new Hono<{ Bindings: Env; Variables: Variables }>()

searchRouter.use("*", authMiddleware())

// GET /api/search?q=...&schema_slug=...&status=...&limit=20&cursor=...
searchRouter.get("/", async (c) => {
  const queryText  = c.req.query("q")?.trim() ?? ""
  const schemaSlug = c.req.query("schema_slug") ?? null
  const status     = c.req.query("status") ?? null
  const rawLimit   = Number.parseInt(c.req.query("limit") ?? "20", 10)
  const limit      = Math.min(Math.max(rawLimit, 1), 50)
  const cursor     = c.req.query("cursor") ?? null

  if (queryText.length < 2) {
    return c.json({ error: "Il parametro 'q' deve avere almeno 2 caratteri." }, 400)
  }

  const seeds = c.get('seedRegistry').all()
  const searchRepository = c.get('searchRepository')

  const queryOptions = {
    queryText,
    schemaSlug,
    statusFilter: status,
    limit,
    cursor,
  }
  const countOptions = { queryText, schemaSlug, statusFilter: status }

  const [rawRows, countResult] = await Promise.all([
    searchRepository.search(queryOptions, seeds),
    searchRepository.count(countOptions, seeds),
  ])

  const hasMore  = rawRows.length > limit
  const pageRows = hasMore ? rawRows.slice(0, limit) : rawRows

  const lastRow = pageRows.at(-1)
  const nextCursor = hasMore && lastRow
    ? encodeCursor(lastRow.rank, lastRow.entryId)
    : null

  if (pageRows.length === 0) {
    return c.json({ items: [], nextCursor: null, total: countResult.total } satisfies SearchResponse)
  }

  const items = pageRows.map(mapSearchResultRow)

  return c.json({ items, nextCursor, total: countResult.total } satisfies SearchResponse)
})
