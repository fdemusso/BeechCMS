// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/constants
 * Error messages and validation limits for the search feature slice.
 * All user-facing strings are centralised here to keep handlers free of literals.
 */

/** Validation and error messages returned by search route handlers. */
export const SEARCH_ERRORS = {
  /** The `q` query parameter is absent or empty. */
  QUERY_REQUIRED: "Parametro 'q' obbligatorio.",
  /** The `q` query parameter is shorter than the minimum allowed length. */
  QUERY_TOO_SHORT: "Il parametro 'q' deve avere almeno 2 caratteri.",
  /** The `q` query parameter exceeds the maximum allowed length. */
  QUERY_TOO_LONG: "Il parametro 'q' supera la lunghezza massima di 150 caratteri.",
  /** The request was blocked by the rate limiter. */
  RATE_LIMIT_EXCEEDED: 'Too Many Requests',
  /** The Cloudflare Workers AI binding is not configured. */
  AI_BINDING_UNAVAILABLE: 'AI binding not available.',
  /** The AI model returned an unrecognisable response shape. */
  EMBEDDING_GENERATION_FAILED: 'Failed to generate embedding.',
} as const

/** Validation limits applied to search query parameters. */
export const SEARCH_LIMITS = {
  /** Minimum number of characters required in the `q` parameter for FTS search. */
  QUERY_MIN_LENGTH: 2,
  /** Maximum number of characters allowed in the `q` parameter for embed requests. */
  EMBED_QUERY_MAX_LENGTH: 150,
  /** Default number of results returned per page when no `limit` parameter is provided. */
  DEFAULT_PAGE_SIZE: 20,
  /** Maximum number of results that can be requested in a single page. */
  MAX_PAGE_SIZE: 50,
  /** Minimum number of results that can be requested in a single page. */
  MIN_PAGE_SIZE: 1,
  /** Minimum number of characters a single FTS term must have to be included in the match expression. */
  FTS_TERM_MIN_LENGTH: 2,
  /** Minimum prefix length used when expanding a term into prefix tokens. */
  FTS_PREFIX_MIN_LENGTH: 3,
  /** Maximum number of seconds the embed response is cached on the CDN edge. */
  EMBED_CACHE_MAX_AGE_SECONDS: 604800,
} as const

/** Worker AI model identifier used to generate text embeddings. */
export const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5' as const

/** Rate limiter key used for the public embed endpoint. */
export const EMBED_RATE_LIMITER_KEY = 'publicApiRead' as const
