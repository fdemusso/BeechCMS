// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import { GLOBAL_SCOPE, hasPermission, type Permission } from '@beechcms/core'
import { resolveEffectivePermissions } from '../shared/rbac/effective-permissions'
import type { Env, Variables } from '../types'

/** Frozen error-code map for this gate, per the `auth/constants.ts` convention. */
export const PERMISSION_ERRORS = {
  FORBIDDEN: 'forbidden',
  ACCOUNT_DISABLED: 'account_disabled',
  ROUTE_NOT_REGISTERED: 'route_not_registered',
} as const

/**
 * How a route's scope is derived.
 * - `'global'`   — the route is not seed-scoped; it is checked at `GLOBAL_SCOPE`.
 * - `'capture1'` — capture group 1 of `pattern` is the `seeds.slug` to check against.
 */
export type ScopeSource = 'global' | 'capture1'

/**
 * What a route demands.
 * - `{ permission, scope }`     — a real RBAC check.
 * - `'authenticated'`           — any active account; self-service and dashboard chrome.
 * - `'legacy-admin'`            — deferred to the slice's own `users.role === 'admin'`
 *                                 guard. The developer axis (brief §2): schema mutation
 *                                 is NOT representable as an RBAC permission and must
 *                                 never become one.
 */
export type RouteRequirement =
  | { kind: 'permission'; permission: Permission; scope: ScopeSource }
  | { kind: 'authenticated' }
  | { kind: 'legacy-admin' }

export interface ProtectedRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** Tested against `c.req.path`, which includes the `/api` prefix. */
  pattern: RegExp
  requirement: RouteRequirement
}

const perm = (permission: Permission, scope: ScopeSource): RouteRequirement =>
  ({ kind: 'permission', permission, scope })
const AUTHED: RouteRequirement = { kind: 'authenticated' }
const LEGACY_ADMIN: RouteRequirement = { kind: 'legacy-admin' }

/**
 * Closed allowlist of every route mounted under `apiProtected`.
 *
 * ORDER IS SIGNIFICANT — first match wins. Literal `/api/content/...` prefixes
 * (`notifications`, `drafts`, `stats`) MUST precede the `/api/content/:slug`
 * patterns, because `:slug` would otherwise swallow them.
 *
 * Enforcement is fail-closed: any `/api/*` path not listed here is refused for every
 * caller. Adding a route without adding a row breaks that route loudly in the
 * completeness test, which is the intended failure mode.
 */
export const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  // --- settings: self-service first, then the site-wide ones -------------------
  { method: 'GET',    pattern: /^\/api\/settings\/me$/,                    requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/profile$/,               requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/password$/,              requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/avatar$/,                requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/settings\/sessions$/,              requirement: AUTHED },
  { method: 'DELETE', pattern: /^\/api\/settings\/sessions\/[^/]+$/,       requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/settings\/notifications$/,         requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/notifications$/,         requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/settings\/activity$/,              requirement: perm('view_analytics', 'global') },
  { method: 'GET',    pattern: /^\/api\/settings\/storage$/,               requirement: perm('view_analytics', 'global') },
  { method: 'GET',    pattern: /^\/api\/settings\/?$/,                     requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/?$/,                     requirement: perm('manage_users', 'global') },

  // --- schema: read is dashboard chrome; layout writes are the developer axis ---
  { method: 'GET',    pattern: /^\/api\/schema\/?$/,                       requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/schema\/[^/]+\/layout$/,           requirement: LEGACY_ADMIN },
  { method: 'DELETE', pattern: /^\/api\/schema\/[^/]+\/layout$/,           requirement: LEGACY_ADMIN },

  // --- seeds: developer axis in full (in-slice requireAdmin decides) -----------
  { method: 'GET',    pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'POST',   pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'PUT',    pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'PATCH',  pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },
  { method: 'DELETE', pattern: /^\/api\/seeds(\/.*)?$/,                    requirement: LEGACY_ADMIN },

  // --- dashboard layout --------------------------------------------------------
  { method: 'GET',    pattern: /^\/api\/dashboard-layout(\/.*)?$/,         requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/dashboard-layout(\/.*)?$/,         requirement: perm('manage_users', 'global') },
  { method: 'DELETE', pattern: /^\/api\/dashboard-layout(\/.*)?$/,         requirement: perm('manage_users', 'global') },

  // --- /api/content literal prefixes — MUST precede the :slug patterns ---------
  { method: 'GET',    pattern: /^\/api\/content\/notifications$/,          requirement: AUTHED },
  { method: 'PATCH',  pattern: /^\/api\/content\/notifications\/[^/]+\/(read|unread)$/, requirement: AUTHED },
  { method: 'DELETE', pattern: /^\/api\/content\/notifications\/[^/]+$/,   requirement: AUTHED },
  { method: 'POST',   pattern: /^\/api\/content\/notifications\/mark-all-read$/, requirement: AUTHED },
  { method: 'GET',    pattern: /^\/api\/content\/drafts$/,                 requirement: perm('content:read', 'global') },
  { method: 'GET',    pattern: /^\/api\/content\/stats\/[^/]+$/,           requirement: perm('view_analytics', 'global') },
  { method: 'POST',   pattern: /^\/api\/content\/stats\/storage\/sync$/,   requirement: perm('view_analytics', 'global') },

  // --- /api/content per-seed: capture group 1 IS the scope ---------------------
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/view-config$/,   requirement: perm('content:read',   'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/view-config$/,   requirement: perm('content:update', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/facets$/,        requirement: perm('content:read',   'capture1') },
  { method: 'PATCH',  pattern: /^\/api\/content\/([^/]+)\/bulk$/,          requirement: perm('content:update', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/by-slug\/[^/]+$/, requirement: perm('content:read',  'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/[^/]+\/backrefs$/, requirement: perm('content:read', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft$/,  requirement: perm('content:read',   'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft$/,  requirement: perm('content:update', 'capture1') },
  { method: 'DELETE', pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft$/,  requirement: perm('content:update', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/[^/]+\/draft\/publish$/, requirement: perm('content:update', 'capture1') },
  { method: 'PATCH',  pattern: /^\/api\/content\/([^/]+)\/[^/]+\/kanban-(move|position)$/, requirement: perm('content:update', 'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)\/[^/]+\/rotate-field$/, requirement: perm('content:update', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,         requirement: perm('content:read',   'capture1') },
  { method: 'PUT',    pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,         requirement: perm('content:update', 'capture1') },
  { method: 'DELETE', pattern: /^\/api\/content\/([^/]+)\/[^/]+$/,         requirement: perm('content:delete', 'capture1') },
  { method: 'GET',    pattern: /^\/api\/content\/([^/]+)$/,                requirement: perm('content:read',   'capture1') },
  { method: 'POST',   pattern: /^\/api\/content\/([^/]+)$/,                requirement: perm('content:create', 'capture1') },

  // --- widgets: last path segment is the seed ---------------------------------
  { method: 'GET',    pattern: /^\/api\/widget\/(?:aggregate|growth|leaderboard|list|timeseries|distribution)\/([^/]+)$/, requirement: perm('content:read', 'capture1') },

  // --- automations, search, uploads: global scope ------------------------------
  { method: 'GET',    pattern: /^\/api\/automations(\/.*)?$/,              requirement: perm('content:read',   'global') },
  { method: 'POST',   pattern: /^\/api\/automations\/?$/,                  requirement: perm('content:update', 'global') },
  { method: 'PUT',    pattern: /^\/api\/automations\/[^/]+$/,              requirement: perm('content:update', 'global') },
  { method: 'PATCH',  pattern: /^\/api\/automations\/[^/]+\/toggle$/,      requirement: perm('content:update', 'global') },
  { method: 'DELETE', pattern: /^\/api\/automations\/[^/]+$/,              requirement: perm('content:delete', 'global') },
  { method: 'GET',    pattern: /^\/api\/search\/?$/,                       requirement: perm('content:read',   'global') },
  { method: 'POST',   pattern: /^\/api\/upload(\/(presign|confirm))?$/,    requirement: perm('content:create', 'global') },
  { method: 'GET',    pattern: /^\/api\/upload\/download-url\/.+$/,        requirement: perm('content:read',   'global') },
  { method: 'DELETE', pattern: /^\/api\/upload\/.+$/,                      requirement: perm('content:delete', 'global') },
]

/** Resolves the rule for a request, plus the scope its pattern captured. */
export function resolveRouteRule(
  method: string,
  path: string,
): { requirement: RouteRequirement; scope: string } | null {
  for (const route of PROTECTED_ROUTES) {
    if (route.method !== method) continue
    const match = route.pattern.exec(path)
    if (!match) continue
    const scope =
      route.requirement.kind === 'permission' && route.requirement.scope === 'capture1'
        ? match[1] ?? GLOBAL_SCOPE
        : GLOBAL_SCOPE
    return { requirement: route.requirement, scope }
  }
  return null
}

function forbidden(code: string, detail: string): Response {
  return new Response(JSON.stringify({ error: code, error_description: detail }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * The single authorization gate for every request under `apiProtected`.
 *
 * Registered AFTER `authMiddleware` (it needs `jwtPayload`) and AFTER
 * `oauthScopeMiddleware` (an OAuth token must clear its scope allowlist before its
 * owner's permissions are even consulted). Both gates apply; neither replaces the other.
 *
 * Order of refusal, all 403:
 * 1. deactivated account — checked for EVERY requirement class, self-service included,
 *    which is what makes deactivation revoke access instantly despite 15-minute JWTs;
 * 2. unregistered route — fail-closed;
 * 3. missing permission at the route's scope.
 *
 * `legacy-admin` routes are passed through to their in-slice `users.role === 'admin'`
 * guard: seed-schema mutation is deliberately not expressible as an RBAC permission
 * (brief §2) and must never be granted one.
 */
export function permissionMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const userId = c.get('jwtPayload')?.sub
    if (!userId) return forbidden(PERMISSION_ERRORS.FORBIDDEN, 'No authenticated subject on this request.')

    const user = await c.get('userRepository').findById(userId)
    if (!user || !user.isActive) {
      return forbidden(PERMISSION_ERRORS.ACCOUNT_DISABLED, 'This account is deactivated.')
    }

    const rule = resolveRouteRule(c.req.method, c.req.path)
    if (!rule) {
      return forbidden(
        PERMISSION_ERRORS.ROUTE_NOT_REGISTERED,
        'This endpoint is not registered in the permission table.',
      )
    }

    if (rule.requirement.kind === 'authenticated' || rule.requirement.kind === 'legacy-admin') {
      await next()
      return
    }

    const effective = await resolveEffectivePermissions(c)
    if (!hasPermission(effective, rule.requirement.permission, rule.scope)) {
      return forbidden(
        PERMISSION_ERRORS.FORBIDDEN,
        `This endpoint requires '${rule.requirement.permission}' on scope '${rule.scope}'.`,
      )
    }

    await next()
  }
}
