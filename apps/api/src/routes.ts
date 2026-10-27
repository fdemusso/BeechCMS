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
import contentFeature from './features/content'
import { contentTransferApp } from './features/content/transfer.router'
import { contentViewsApp } from './features/content/views.router'
import { contentTrashApp } from './features/content/trash.router'
import { widgetApp } from './features/widget/widget'
import { rotateFieldApp } from './features/rotate-field'
import { draftApp } from './features/draft'
import { settingsApp } from './features/settings/settings.handler'
import { schemaApp } from './features/schema/schema.handler'
import { dashboardLayoutApp } from './features/dashboard-layout'
import { seedsApp } from './features/seeds'
import { rbacApp } from './features/rbac'
import { notificationsApp } from './features/notifications'
import { automationsApp } from './features/automations/api/automations.handler'
import { statsApp } from './features/stats'
import { backrefsApp } from './features/backrefs'
import { searchRouter } from './features/search'
import { uploadRoutes } from './features/upload'

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

/**
 * The authenticated CMS API, relative to `/api`. The factory mounts it behind the auth, OAuth
 * scope and RBAC middleware, so none of those appear here.
 *
 * The order is load-bearing: several routers share the `/content` prefix and Hono answers with
 * the first match, so it is the order the factory registered them in. A router that is not a
 * method chain yet is still mounted (and served); it just adds nothing to `AppType`.
 */
export const protectedRoutes = new Hono<AppEnv>()
  .route('/settings', settingsApp)
  .route('/schema', schemaApp)
  .route('/dashboard-layout', dashboardLayoutApp)
  .route('/seeds', seedsApp)
  .route('/rbac', rbacApp)
  .route('/content', notificationsApp)
  .route('/content', statsApp)
  .route('/content', rotateFieldApp)
  .route('/content', draftApp)
  .route('/content', backrefsApp)
  .route('/content', contentTransferApp)
  .route('/content', contentViewsApp)
  .route('/content', contentTrashApp)
  .route('/content', contentFeature)
  .route('/widget', widgetApp)
  .route('/automations', automationsApp)
  .route('/search', searchRouter)
  .route('/', uploadRoutes)

const rpcRoutes = new Hono<AppEnv>().route('/', publicAuthRoutes).route('/api', protectedRoutes)

/** Route types for `hc<AppType>()`; type-only, nothing at runtime depends on `rpcRoutes`. */
export type AppType = typeof rpcRoutes
