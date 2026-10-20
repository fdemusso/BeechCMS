// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { Context } from 'hono'
import { cleanStr } from '../../shared/utils/query-utils'
import { checkPublicOperation } from '../validation/access-policy'
import { publicProblem, internalErrorDetail } from '../errors/problem-details'
import { resolveEdgeCache, withCachedResponse } from '../utils/cache-utils'
import { readSingleEntry } from './read-single'
import { readListEntries } from './read-list'
import { loadPublicLanguage, languageCacheKey, setLanguageHeaders } from '../localization/public-language'
import { AppEnv } from '../../types'

export async function publicReadHandler(context: Context<AppEnv>) {
  const seedSlug = context.req.param('seed') ?? ''
  const seed = context.get('getSeed')(seedSlug)
  if (!seed) {
    const available = context.get('seedRegistry').all().map(s => s.slug).join(', ')
    return publicProblem(context, {
      type: 'seed-not-found',
      title: 'Seed Not Found',
      status: 404,
      detail: `The content type '${seedSlug}' does not exist. Available types: ${available}.`,
    })
  }

  const access = checkPublicOperation(seed, 'read')
  if (!access.ok) {
    return publicProblem(context, { type: 'operation-not-allowed', title: access.error.error, status: 403, detail: access.error.message })
  }

  const negotiated = await loadPublicLanguage({
    registry: context.get('seedRegistry'),
    settings: context.get('siteSettingsRepository'),
    lang: context.req.query('lang'),
    acceptLanguage: context.req.header('Accept-Language'),
  })
  if (!negotiated.ok) {
    return publicProblem(context, { type: 'invalid-lang', title: 'Bad Request', status: 400, detail: negotiated.detail })
  }
  const language = negotiated.language

  const edgeCache = resolveEdgeCache(context)
  const cacheKey = languageCacheKey(context.req.raw, language)
  if (edgeCache) {
    const hit = await edgeCache.cache.match(cacheKey)
    if (hit) return hit
  }
  setLanguageHeaders(context, language)

  const query = context.req.query()
  const id = cleanStr(query.id)
  const slug = cleanStr(query.slug)
  const publishedOnly = context.env.PUBLIC_PUBLISHED_ONLY !== 'false'
  const repository = context.get('repository')

  try {
    if (id || slug) {
      const result = await readSingleEntry({ seed, seedSlug, repository, id, slug, publishedOnly, fieldsParam: query.fields, query, getSeed: context.get('getSeed'), language })
      if (!result.ok) {
        return publicProblem(context, { type: 'entry-not-found', title: 'Not Found', status: 404, detail: result.detail })
      }
      return withCachedResponse(edgeCache, cacheKey, context.json({ data: result.data, meta: result.meta }, 200))
    }

    const result = await readListEntries({ seed, seedSlug, repository, query, publishedOnly, getSeed: context.get('getSeed'), language })
    return withCachedResponse(edgeCache, cacheKey, context.json(result, 200))
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid subquery:')) {
      return publicProblem(context, { type: 'invalid-subquery', title: 'Invalid Subquery', status: 400, detail: error.message })
    }
    if (error instanceof Error && error.message.startsWith('Invalid filter:')) {
      return publicProblem(context, { type: 'invalid-filter', title: 'Bad Request', status: 400, detail: error.message })
    }
    if (error instanceof Error && error.message.startsWith('Invalid include:')) {
      return publicProblem(context, { type: 'invalid-include', title: 'Invalid Include', status: 400, detail: error.message })
    }
    console.error('Public read error:', error)
    return publicProblem(context, { type: 'internal-server-error', title: 'Internal Server Error', status: 500, detail: internalErrorDetail(context.env, error) })
  }
}
