// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Catalog ↔ router fail-closed guard (unit tier, no D1): every route the factory mounts
 * has exactly one OPERATION_CATALOG entry and vice versa. `/api/custom/*` routes are not
 * catalogued by design, so the app is built without `customRoutes`.
 */

import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { OPERATION_CATALOG, SCOPE_GRANT_REQUIREMENTS, matchOperation, type AgentOperationSpec, type OAuthScope, type Permission } from '@beechcms/core'
import { createBeechApp } from './factory'
import { InMemorySeedRepository } from './shared/db/repositories/in-memory-seed.repository'
import { resolveRouteRule } from './middleware/permission.middleware'
import { resolveRequiredScope } from './middleware/oauth-scope.middleware'

/** Replaces every `:param` and `:param{re}` segment with `x`. */
const toConcretePath = (pattern: string): string => pattern.replace(/:[^/{]+(\{[^}]*\})?/g, 'x')

const toRouteKey = (route: { method: string; path: string }): string => `${route.method} ${route.path}`

const catalogRouteKeys = new Set(OPERATION_CATALOG.map(toRouteKey))

const agentOperations = OPERATION_CATALOG.filter(
  (operation): operation is AgentOperationSpec => operation.exposure === 'agent',
)

/** `method path` of every route the factory mounts, minus `ALL` handlers and the dashboard SPA. */
function mountedRouteKeys(): Set<string> {
  const app = createBeechApp({ seeds: [], seedRepository: new InMemorySeedRepository([]) })
  return new Set(
    app.routes
      .filter(route => route.method !== 'ALL' && route.path !== '/admin' && route.path !== '/admin/*')
      .map(toRouteKey),
  )
}

describe('OPERATION_CATALOG ↔ createBeechApp parity', () => {
  it('catalogues every route the factory mounts', () => {
    const mounted = mountedRouteKeys()

    const uncatalogued = [...mounted].filter(key => !catalogRouteKeys.has(key))

    expect(uncatalogued).toEqual([])
  })

  it('mounts every catalogued operation', () => {
    const mounted = mountedRouteKeys()

    const unmounted = [...catalogRouteKeys].filter(key => !mounted.has(key))

    expect(unmounted).toEqual([])
  })

  it('places every agent operation behind the RBAC route table', () => {
    const withoutRule = agentOperations
      .filter(operation => resolveRouteRule(operation.method, toConcretePath(operation.path)) === null)
      .map(operation => operation.id)

    expect(withoutRule).toEqual([])
  })

  it('keeps the scope of the five 1.x OAuth routes', () => {
    const oauthRoutes = [
      ['GET', '/api/seeds', 'schema:read'],
      ['GET', '/api/seeds/articles', 'schema:read'],
      ['GET', '/api/schema', 'schema:read'],
      ['POST', '/api/seeds/articles/mcp-plan', 'schema:read'],
      ['POST', '/api/seeds/articles/mcp-apply', 'schema:write'],
    ] as const

    const resolvedScopes = oauthRoutes.map(([method, path]) => resolveRequiredScope(method, path))

    expect(resolvedScopes).toEqual(oauthRoutes.map(([, , scope]) => scope))
  })

  it('derives SCOPE_GRANT_REQUIREMENTS from the RBAC rule of every agent operation', () => {
    // A route whose RBAC rule changes must move the consent guard with it.
    const folded = new Map<OAuthScope, 'authenticated' | Set<Permission>>()
    for (const operation of agentOperations) {
      const rule = resolveRouteRule(operation.method, toConcretePath(operation.path))
      if (!rule) continue
      const { requirement } = rule
      const current = folded.get(operation.scope)
      if (requirement.kind === 'authenticated') {
        folded.set(operation.scope, 'authenticated')
        continue
      }
      if (current === 'authenticated') continue
      const permissions = new Set(current)
      const required = requirement.kind === 'permission' ? [requirement.permission] : requirement.permissions
      for (const permission of required) permissions.add(permission)
      folded.set(operation.scope, permissions)
    }

    const derived = Object.fromEntries(
      [...folded].map(([scope, value]) => [scope, value === 'authenticated' ? value : [...value].sort()]),
    )
    const declared = Object.fromEntries(
      Object.entries(SCOPE_GRANT_REQUIREMENTS).map(([scope, value]) => [scope, value === 'authenticated' ? value : [...value].sort()]),
    )

    expect(derived).toEqual(declared)
  })

  it('agrees with Hono on every ghost collision, or both operations share scope, exposure and risk', () => {
    // The gate classifies with the catalog matcher while Hono dispatches by registration order.
    const app = createBeechApp({ seeds: [], seedRepository: new InMemorySeedRepository([]) })
    const literalsByPosition = new Map<number, Set<string>>()
    for (const operation of OPERATION_CATALOG) {
      operation.path.split('/').forEach((segment, index) => {
        if (segment.startsWith(':')) return
        literalsByPosition.set(index, (literalsByPosition.get(index) ?? new Set()).add(segment))
      })
    }

    const disagreements: string[] = []
    for (const operation of OPERATION_CATALOG) {
      const segments = operation.path.split('/')
      const paramIndexes = segments.flatMap((segment, index) => (segment.startsWith(':') ? [index] : []))
      const probes = new Set([toConcretePath(operation.path)])
      for (const index of paramIndexes) {
        for (const literal of literalsByPosition.get(index) ?? []) {
          probes.add(segments.map((segment, position) => (position === index ? literal : segment.startsWith(':') ? 'x' : segment)).join('/'))
        }
      }
      for (const probe of probes) {
        const honoRoute = app.router
          .match(operation.method, probe)[0]
          .map(([[, routerRoute]]) => routerRoute)
          .find(routerRoute => routerRoute.method === operation.method)
        const honoOperation = honoRoute ? OPERATION_CATALOG.find(candidate => candidate.method === honoRoute.method && candidate.path === honoRoute.path) : undefined
        const catalogOperation = matchOperation(operation.method, probe)
        if (!honoOperation || !catalogOperation || honoOperation.path === catalogOperation.path) continue
        const sameClassification =
          honoOperation.exposure === catalogOperation.exposure &&
          (honoOperation.exposure !== 'agent' ||
            (catalogOperation.exposure === 'agent' && honoOperation.scope === catalogOperation.scope && honoOperation.risk === catalogOperation.risk))
        if (!sameClassification) disagreements.push(`${operation.method} ${probe}: hono=${honoOperation.id} catalog=${catalogOperation.id}`)
      }
    }

    expect(disagreements).toEqual([])
  })

  it('points every docs reference at an existing file under docs/reference', () => {
    const docsReferenceDir = resolve(__dirname, '../../../docs/reference')
    const referencedDocs = [...new Set(OPERATION_CATALOG.flatMap(operation => (operation.docs ? [operation.docs] : [])))]

    const missingDocs = referencedDocs.filter(doc => !existsSync(resolve(docsReferenceDir, doc)))

    expect(referencedDocs.length).toBeGreaterThan(0)
    expect(missingDocs).toEqual([])
  })
})
