// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module @beechcms/api/routes
 * @description The route tree shared by the runtime and the typed client.
 *
 * `factory.ts` mounts these routers, and `AppType` is derived from the very same values, so the
 * type the dashboard's `hc<AppType>()` sees cannot drift from what is actually served. A router
 * contributes types only when it is registered as ONE method chain
 * (`new Hono().get(...).post(...)`); a router built with separate statements still serves
 * requests but is invisible to the client until it is converted.
 */
import { Hono } from 'hono'
import type { AppEnv } from './types'
import { authApp } from './auth'
import { setupApp } from './features/setup'
import { passwordResetApp } from './features/password-reset'
import { rbacPublicApp } from './features/rbac/public'
import { oauthApp } from './features/oauth'

/**
 * Unauthenticated `/auth/*` and `/oauth/*` endpoints, mounted at the root. The order is the
 * order they were registered in before this module existed.
 */
export const publicAuthRoutes = new Hono<AppEnv>()
  .route('/', authApp)
  .route('/', setupApp)
  .route('/', passwordResetApp)
  .route('/', rbacPublicApp)
  .route('/', oauthApp)

const rpcRoutes = new Hono<AppEnv>().route('/', publicAuthRoutes)

/** Route types for `hc<AppType>()`; type-only, nothing at runtime depends on `rpcRoutes`. */
export type AppType = typeof rpcRoutes
