// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module search/public-search.router
 * Public (unauthenticated) search Hono sub-app.
 *
 * Mounted under the public API prefix in `factory.ts`.
 * Authentication is handled upstream via API-key middleware; individual
 * endpoints apply per-IP rate limiting through the injected `rateLimiters`.
 *
 * Routes:
 * - `GET /embed` → {@link embedHandler}
 */

/// <reference types="@cloudflare/workers-types" />
import { Hono }        from 'hono'
import type { AppEnv } from '../../types'
import { embedHandler } from './handlers/embed'

/** Hono sub-app for the public search endpoints (embedding generation). */
export const publicSearchRouter = new Hono<AppEnv>()

// GET /api/v1/public/search/embed?q=…
publicSearchRouter.get('/embed', embedHandler)
