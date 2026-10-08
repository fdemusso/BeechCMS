// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/handlers/embed
 * Thin route handler for `GET /api/v1/public/search/embed`.
 *
 * Generates a text embedding vector for the provided query string using
 * the Cloudflare Workers AI binding. The vector is returned as a flat
 * array of 32-bit floats and is aggressively cached at the CDN edge.
 *
 * Responsibilities:
 * - Validate the `q` query parameter.
 * - Apply per-IP rate limiting via the injected `rateLimiters` registry.
 * - Call the Workers AI model and normalise its response into a Float32Array.
 * - Set cache headers and return the embedding.
 */

import type { Context } from 'hono'
import type { AppEnv } from '../../../types'
import { getClientIp } from '../../../shared/utils/request-utils'
import {
  SEARCH_ERRORS,
  SEARCH_LIMITS,
  EMBEDDING_MODEL,
  EMBED_RATE_LIMITER_KEY,
} from '../constants'
import { normaliseEmbeddingResponse } from '../utils/embedding-response'
import type { EmbedResponse } from '../types'

/**
 * Handles `GET /api/v1/public/search/embed?q=…`.
 *
 * Query parameters:
 * - `q` / `query` / `text` – Query string to embed (required, ≤ 150 characters).
 *   The first non-empty value among the three aliases is used.
 *
 * Response headers:
 * - `Cache-Control: public, max-age=604800`
 * - `Edge-Control: s-maxage=604800`
 *
 * @param c - Hono context with typed `AppEnv` bindings and variables.
 * @returns A JSON {@link EmbedResponse} containing the embedding vector.
 */
export async function embedHandler(c: Context<AppEnv>): Promise<Response> {
  const queryText = (
    c.req.query('q') ?? c.req.query('query') ?? c.req.query('text') ?? ''
  ).trim()

  if (!queryText) {
    return c.json({ error: SEARCH_ERRORS.QUERY_REQUIRED }, 400)
  }

  if (queryText.length > SEARCH_LIMITS.EMBED_QUERY_MAX_LENGTH) {
    return c.json({ error: SEARCH_ERRORS.QUERY_TOO_LONG }, 400)
  }

  // Per-IP rate limiting via the injected registry
  const rateLimiters = c.get('rateLimiters')
  if (rateLimiters) {
    const clientIp   = getClientIp(c.req)
    const limitResult = await rateLimiters
      .getLimiter(EMBED_RATE_LIMITER_KEY)
      .checkLimit(`embed:${clientIp}`)

    if (!limitResult.isAllowed) {
      const responseHeaders: Record<string, string> = {}
      if (limitResult.retryAfterSeconds !== undefined) {
        responseHeaders['Retry-After'] = String(limitResult.retryAfterSeconds)
      }
      return c.json(
        { error: SEARCH_ERRORS.RATE_LIMIT_EXCEEDED, retryAfter: limitResult.retryAfterSeconds },
        429,
        responseHeaders,
      )
    }
  }

  const ai = c.env.AI
  if (!ai) {
    return c.json({ error: SEARCH_ERRORS.AI_BINDING_UNAVAILABLE }, 503)
  }

  try {
    const aiResponse  = await ai.run(EMBEDDING_MODEL, { text: queryText })
    const embeddingVector = normaliseEmbeddingResponse(aiResponse)

    c.header('Cache-Control', `public, max-age=${SEARCH_LIMITS.EMBED_CACHE_MAX_AGE_SECONDS}`)
    c.header('Edge-Control', `s-maxage=${SEARCH_LIMITS.EMBED_CACHE_MAX_AGE_SECONDS}`)

    return c.json({
      data:  Array.from(embeddingVector),
      shape: [embeddingVector.length],
    } satisfies EmbedResponse)
  } catch (embeddingError) {
    console.error('[search/embed] Embedding generation failed:', embeddingError)
    return c.json({ error: SEARCH_ERRORS.EMBEDDING_GENERATION_FAILED }, 500)
  }
}
