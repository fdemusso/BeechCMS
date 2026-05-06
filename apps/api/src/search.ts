// apps/api/src/search.ts

import { Hono }              from "hono"
import type { Env, Variables } from "./types"
import { authMiddleware }    from "./middleware"
import {
  buildFtsQuery,
  encodeCursor,
  mapFtsRow,
  type FtsRow,
  type SearchResponse,
} from "./search-utils"

export const searchRouter = new Hono<{ Bindings: Env; Variables: Variables }>()

searchRouter.use("*", async (c, next) => {
  return authMiddleware(c.env.JWT_SECRET, {
    issuer: c.env.JWT_ISSUER,
    audience: c.env.JWT_AUDIENCE,
  })(c, next)
})

// GET /api/search?q=...&schema_slug=...&status=...&limit=20&cursor=...
searchRouter.get("/", async (c) => {
  const q          = c.req.query("q")?.trim() ?? ""
  const schemaSlug = c.req.query("schema_slug") ?? null
  const status     = c.req.query("status") ?? null
  const rawLimit   = parseInt(c.req.query("limit") ?? "20", 10)
  const limit      = Math.min(Math.max(rawLimit, 1), 50)
  const cursor     = c.req.query("cursor") ?? null

  if (q.length < 2) {
    return c.json({ error: "Il parametro 'q' deve avere almeno 2 caratteri." }, 400)
  }

  const seeds = Object.values(c.get('seedRegistry'))

  let queryParts: ReturnType<typeof buildFtsQuery>
  try {
    queryParts = buildFtsQuery({ q, schemaSlug, status, limit, cursor }, seeds)
  } catch (e) {
    if ((e as Error).message === "EMPTY_QUERY") {
      return c.json({ items: [], nextCursor: null, total: 0 } satisfies SearchResponse)
    }
    throw e
  }

  const { sql, binds, countSql, countBinds } = queryParts

  const [ftsResult, countResult] = await Promise.all([
    c.env.DB.prepare(sql).bind(...binds).all<FtsRow>(),
    c.env.DB.prepare(countSql).bind(...countBinds).first<{ total: number }>(),
  ])

  const rows  = ftsResult.results ?? []
  const total = countResult?.total ?? 0

  const hasMore  = rows.length > limit
  const pageRows = hasMore ? rows.slice(0, limit) : rows

  const nextCursor = hasMore
    ? encodeCursor(pageRows.at(-1)!.rank, pageRows.at(-1)!.entry_id)
    : null

  if (pageRows.length === 0) {
    return c.json({ items: [], nextCursor: null, total } satisfies SearchResponse)
  }

  const items = pageRows.map(row => mapFtsRow(row))

  return c.json({ items, nextCursor, total } satisfies SearchResponse)
})
