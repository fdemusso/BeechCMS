// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { Context, Next } from 'hono'
import { matchOperation, type OAuthScope } from '@beechcms/core'
import type { Env, Variables } from '../types'

/**
 * Scope an OAuth token needs for `method` + `path`: the catalog scope of an `agent`
 * operation, or `null` when the request is uncatalogued or `excluded` (never reachable).
 *
 * @param method - The HTTP request method (e.g. `'GET'`, `'POST'`).
 * @param path - The full request pathname (e.g. `c.req.path`).
 * @returns The required {@link OAuthScope}, or `null` if the route is not OAuth-reachable.
 */
export function resolveRequiredScope(method: string, path: string): OAuthScope | null {
  const operation = matchOperation(method, path)
  return operation?.exposure === 'agent' ? operation.scope : null
}

/**
 * Generates an RFC 6750 403 Forbidden response with `insufficient_scope` challenge.
 *
 * @param required - The scope demanded by the route, or `null` if route is unmapped.
 * @returns An HTTP 403 JSON Response.
 */
export function insufficientScopeResponse(required: OAuthScope | null): Response {
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
 * - For OAuth requests, classifies the route with `OPERATION_CATALOG` (via `matchOperation`): uncatalogued and
 *   `excluded` operations are refused, and the token grant must include the operation's {@link OAuthScope}.
 * - Returns HTTP 403 (`insufficient_scope`) on failure rather than 401, allowing MCP clients to distinguish
 *   insufficient privileges from expired or invalid credentials.
 * - Risk (`publish` / `destructive`) is enforced after RBAC by `agentIntentGate()`.
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

    const operation = matchOperation(c.req.method, c.req.path)
    if (!operation || operation.exposure === 'excluded') {
      return insufficientScopeResponse(null)
    }
    if (!grant.scope.includes(operation.scope)) {
      return insufficientScopeResponse(operation.scope)
    }

    await next()
  }
}
