// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { OPERATION_CATALOG } from './catalog.js'
import type { AgentOperationSpec, ExcludedOperationSpec } from './types.js'
import { resolveOperationRisk } from './match.js'
import { OAUTH_SCOPES } from '../oauth/scopes.js'

const agentOperations = OPERATION_CATALOG.filter(
  (operation): operation is AgentOperationSpec => operation.exposure === 'agent',
)

describe('OPERATION_CATALOG', () => {
  it('gives every operation a unique id in domain.camelCaseVerb form', () => {
    const ids = OPERATION_CATALOG.map(operation => operation.id)

    const malformedIds = ids.filter(id => !/^[a-z]+\.[a-z][a-zA-Z]*$/.test(id))

    expect(malformedIds).toEqual([])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('lists every method and path pair exactly once', () => {
    const routeKeys = OPERATION_CATALOG.map(operation => `${operation.method} ${operation.path}`)

    const duplicateKeys = routeKeys.filter((key, index) => routeKeys.indexOf(key) !== index)

    expect(duplicateKeys).toEqual([])
  })

  it('gives every excluded operation a non-empty reason', () => {
    const excludedOperations = OPERATION_CATALOG.filter(
      (operation): operation is ExcludedOperationSpec => operation.exposure === 'excluded',
    )

    const withoutReason = excludedOperations.filter(operation => operation.excludedReason.trim() === '')

    expect(excludedOperations.length).toBeGreaterThan(0)
    expect(withoutReason).toEqual([])
  })

  it('exposes to agents only routes under apiProtected', () => {
    const outsideApiProtected = /^\/api\/(v1\/public|webhooks|media|custom)(\/|$)/

    const misplaced = agentOperations
      .filter(operation => !operation.path.startsWith('/api/') || outsideApiProtected.test(operation.path))
      .map(operation => operation.id)

    expect(misplaced).toEqual([])
  })

  it('uses every OAuth scope on at least one agent operation', () => {
    // No speculative scopes: a scope no operation needs would be granted for nothing.
    const usedScopes = new Set(agentOperations.map(operation => operation.scope))

    const unusedScopes = OAUTH_SCOPES.filter(scope => !usedScopes.has(scope))

    expect(unusedScopes).toEqual([])
  })

  it('excludes every human-only operation', () => {
    const humanOnlyIds = [
      'settings.passwordUpdate',
      'settings.profileUpdate',
      'settings.sessionRevoke',
      'content.rotateField',
      'users.create',
      'oauth.consentsList',
      'oauth.consentRevoke',
    ]

    const exposures = humanOnlyIds.map(id => [id, OPERATION_CATALOG.find(operation => operation.id === id)?.exposure])

    expect(exposures).toEqual(humanOnlyIds.map(id => [id, 'excluded']))
  })

  it('classifies every agent GET as a static read', () => {
    const agentReads = agentOperations.filter(operation => operation.method === 'GET')

    const notStaticRead = agentReads.filter(operation => operation.risk !== 'read').map(operation => operation.id)

    expect(agentReads.length).toBeGreaterThan(0)
    expect(notStaticRead).toEqual([])
  })

  it('requires a write-side scope on every mutating agent operation except the seeds.plan dry-run and intents.reject', () => {
    const mutatingAgentOperations = agentOperations.filter(operation => operation.method !== 'GET')

    const readScopedMutationIds = mutatingAgentOperations
      .filter(operation => operation.scope.endsWith(':read'))
      .map(operation => operation.id)

    // seeds.plan keeps the 1.x contract: a POST that only computes a migration plan, so schema:read suffices.
    // intents.reject acts only on the caller's own intents, so agent:read suffices.
    expect(readScopedMutationIds).toEqual(['seeds.plan', 'intents.reject'])
  })

  it('keeps the three request-dependent risk rules on content.create, content.update and content.delete only', () => {
    const ruleOperations = agentOperations.filter(operation => typeof operation.risk === 'function')

    const ruleNamesById = Object.fromEntries(
      ruleOperations.map(operation => [operation.id, (operation.risk as (...args: never[]) => unknown).name]),
    )

    expect(ruleNamesById).toEqual({
      'content.create': 'publishWhenStatusPublished',
      'content.update': 'publishWhenStatusPublished',
      'content.delete': 'destructiveWhenPurge',
    })
  })

  it('never gives an intents operation a risk that would create an intent', () => {
    // Approving must not itself need approval.
    const intentOperations = agentOperations.filter(operation => operation.id.startsWith('intents.'))

    const risks = intentOperations.map(operation => resolveOperationRisk(operation, { query: {}, body: undefined }))

    expect(intentOperations).toHaveLength(4)
    expect(risks.filter(risk => risk === 'publish' || risk === 'destructive')).toEqual([])
  })
})
