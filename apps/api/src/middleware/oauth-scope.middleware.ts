// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import type { OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../types'

/**
 * Route mapping definition for OAuth scope enforcement.
 */
export interface OAuthScopeRoute {
  /** HTTP method accepted for the route. */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  /** Regular expression tested against the full request path (`c.req.path`). */
  pattern: RegExp
  /** Scope required to access this endpoint. */
  scope: OAuthScope
  /** Informational identifier of the MCP tool(s) backed by this endpoint. */
  tools: string
}

/**
 * Closed allowlist of API routes accessible via OAuth 2.1 access tokens and their required scopes.
 *
 * @remarks
 * Enforcement is fail-closed: any `/api/*` path not explicitly registered in this table
 * is denied for OAuth-authenticated requests. Centralized enforcement ensures that forgetting
 * to register a route refuses access rather than accidentally permitting it.
 *
 * Route mappings correspond directly to MCP tools (`beech_schema_export` and `beech_schema_validate`
 * share `GET /api/schema`).
 *
 * `POST /api/seeds/:slug/mcp-plan` is intentionally mapped to `schema:read` because it performs
 * a dry-run calculation (DDL and safety classification) without mutating state. Only `mcp-apply`
 * requires `schema:write`.
 *
 * Patterns match against `c.req.path`, which includes the `/api` prefix.
 */
export const OAUTH_SCOPE_ROUTES: readonly OAuthScopeRoute[] = [
  { method: 'GET',  pattern: /^\/api\/seeds\/?$/,                    scope: 'schema:read',  tools: 'beech_list_seeds' },
  { method: 'GET',  pattern: /^\/api\/seeds\/[^/]+$/,                scope: 'schema:read',  tools: 'beech_get_seed' },
  { method: 'GET',  pattern: /^\/api\/schema\/?$/,                   scope: 'schema:read',  tools: 'beech_schema_export, beech_schema_validate' },
  { method: 'POST', pattern: /^\/api\/seeds\/[^/]+\/mcp-plan$/,      scope: 'schema:read',  tools: 'beech_schema_plan (dry-run)' },
  { method: 'POST', pattern: /^\/api\/seeds\/[^/]+\/mcp-apply$/,     scope: 'schema:write', tools: 'beech_schema_apply' },
]

/**
 * Resolves the required OAuth scope for a given route.
 *
 * @param method - The HTTP request method (e.g. `'GET'`, `'POST'`).
 * @param path - The full request pathname (e.g. `c.req.path`).
 * @returns The required {@link OAuthScope}, or `null` if the route is not OAuth-reachable.
 */
export function resolveRequiredScope(method: string, path: string): OAuthScope | null {
  const match = OAUTH_SCOPE_ROUTES.find(route => route.method === method && route.pattern.test(path))
  return match ? match.scope : null
}

/**
 * Generates an RFC 6750 403 Forbidden response with `insufficient_scope` challenge.
 *
 * @param required - The scope demanded by the route, or `null` if route is unmapped.
 * @returns An HTTP 403 JSON Response.
 */
function insufficientScopeResponse(required: OAuthScope | null): Response {
  const challenge = required
    ? `Bearer error="insufficient_scope", scope="${required}"`
    : 'Bearer error="insufficient_scope"'
  return new Response(
    JSON.stringify({
      error: 'insufficient_scope',
      error_description: required
        ? `This endpoint requires the '${required}' scope.`
        : 'This endpoint is not reachable with an OAuth access token.',
    }),
    { status: 403, headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': challenge } },
  )
}

/**
 * Middleware enforcing OAuth 2.1 scope boundaries on protected API routes.
 *
 * @remarks
 * This middleware operates in a fail-closed manner:
 * - Must be registered immediately after `authMiddleware({ acceptOAuth: true })`, which populates `oauthGrant`.
 * - Requests authenticated via the admin JWT carry `oauthGrant === null` and pass through untouched.
 * - For OAuth requests, verifies that the route is allowlisted in {@link OAUTH_SCOPE_ROUTES} and that the token
 *   grant includes the necessary {@link OAuthScope}.
 * - Returns HTTP 403 (`insufficient_scope`) on failure rather than 401, allowing MCP clients to distinguish
 *   insufficient privileges from expired or invalid credentials.
 *
 * @returns A Hono middleware handler enforcing scope boundaries.
 */
export function oauthScopeMiddleware() {
  return async (c: Context<{ Bindings: Env; Variables: Variables }>, next: Next): Promise<Response | void> => {
    const grant = c.get('oauthGrant')
    if (!grant) {
      await next()
      return
    }

    const required = resolveRequiredScope(c.req.method, c.req.path)
    if (required === null || !grant.scope.includes(required)) {
      return insufficientScopeResponse(required)
    }

    await next()
  }
}
