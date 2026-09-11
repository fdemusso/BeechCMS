// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/handlers/serve-index
 * Thin route handler for `GET /api/v1/public/search/index/:seedSlug/:file`.
 *
 * Serves the `manifest.json` and `vectors.bin` R2 objects produced by
 * {@link compileR2Manifest} so `@beechcms/search-client` can download them
 * directly from `SearchClient.loadIndex(manifestUrl, vectorsUrl)`.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../../../types'
import { manifestKey, vectorsKey } from '../jobs/semantic-search.worker'

const CONTENT_TYPES: Record<string, string> = {
  'manifest.json': 'application/json',
  'vectors.bin':   'application/octet-stream',
}

/** Cache lifetime, in seconds, for served index assets. */
const INDEX_CACHE_MAX_AGE_SECONDS = 300

/**
 * Handles `GET /api/v1/public/search/index/:seedSlug/:file`.
 *
 * `:file` must be `manifest.json` or `vectors.bin`; any other value yields 404.
 *
 * @param c - Hono context with typed `AppEnv` bindings and variables.
 * @returns The raw R2 object body, or 404 when the seed has no compiled index yet.
 */
export async function serveIndexHandler(c: Context<AppEnv>): Promise<Response> {
  const seedSlug = c.req.param('seedSlug')
  const file      = c.req.param('file')

  const contentType = file ? CONTENT_TYPES[file] : undefined
  if (!seedSlug || !file || !contentType) {
    return c.notFound()
  }

  const searchR2 = c.env.SEARCH_R2
  if (!searchR2) {
    return c.notFound()
  }

  const key = file === 'manifest.json' ? manifestKey(seedSlug) : vectorsKey(seedSlug)

  const object = await searchR2.get(key)
  if (!object) {
    return c.notFound()
  }

  c.header('Content-Type', contentType)
  c.header('Cache-Control', `public, max-age=${INDEX_CACHE_MAX_AGE_SECONDS}`)
  if (object.httpEtag) {
    c.header('ETag', object.httpEtag)
  }

  return c.body(object.body)
}
