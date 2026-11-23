// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { OPERATION_CATALOG } from './catalog.js'
import { matchOperation, resolveOperationRisk } from './match.js'
import type { AgentOperationSpec, OperationRiskInput } from './types.js'

/** Replaces every `:param` and `:param{re}` segment with `x`. */
const toConcretePath = (pattern: string): string => pattern.replace(/:[^/{]+(\{[^}]*\})?/g, 'x')

const agentOperation = (id: string): AgentOperationSpec => {
  const operation = OPERATION_CATALOG.find(candidate => candidate.id === id)
  if (operation?.exposure !== 'agent') throw new Error(`No agent operation ${id} in the catalog`)
  return operation
}

describe('matchOperation', () => {
  it('resolves literal /api/content prefixes before the :slug patterns', () => {
    const cases = [
      ['GET', '/api/content/drafts', 'drafts.list'],
      ['GET', '/api/content/stats/total', 'stats.total'],
      ['GET', '/api/content/import-jobs/j1', 'content.importStatus'],
      ['GET', '/api/content/posts/trash', 'trash.list'],
      ['GET', '/api/seeds/purges/p1', 'seeds.purgeStatus'],
    ] as const

    const resolved = cases.map(([method, path]) => [method, path, matchOperation(method, path)?.id])

    expect(resolved).toEqual(cases)
  })

  it('resolves DELETE /api/content/notifications/:id to notifications.delete, not content.delete', () => {
    // Regression guard: falling through to content.delete would make the intent gate
    // treat a notification dismissal as a content delete.
    const operation = matchOperation('DELETE', '/api/content/notifications/n1')

    expect(operation?.id).toBe('notifications.delete')
  })

  it('ignores one trailing slash', () => {
    const operation = matchOperation('GET', '/api/seeds/')

    expect(operation?.id).toBe('seeds.list')
  })

  it('matches the multi-segment media key', () => {
    const operation = matchOperation('GET', '/api/media/a/b/c.png')

    expect(operation?.id).toBe('internal.mediaServe')
  })

  it('returns null for an uncatalogued path, a custom route and an unsupported method', () => {
    const misses = [
      ['GET', '/api/nope'],
      ['GET', '/api/custom/anything'],
      ['PATCH', '/api/content/posts/e1'],
      ['HEAD', '/api/seeds'],
    ] as const

    const resolved = misses.map(([method, path]) => matchOperation(method, path))

    expect(resolved).toEqual([null, null, null, null])
  })

  it('maps every catalogued operation back to itself from a concrete path', () => {
    const expectedIds = OPERATION_CATALOG.map(operation => operation.id)

    const resolvedIds = OPERATION_CATALOG.map(
      operation => matchOperation(operation.method, toConcretePath(operation.path))?.id,
    )

    expect(resolvedIds).toEqual(expectedIds)
  })
})

describe('resolveOperationRisk', () => {
  const noQuery: OperationRiskInput['query'] = {}

  it('returns publish for content.create when status is published, trimmed like the handler', () => {
    // The handler reads status through cleanStr, which trims; a non-trimming rule would
    // let a padded status publish without passing the production gate.
    const create = agentOperation('content.create')
    const statuses = ['published', ' published ']

    const risks = statuses.map(status => resolveOperationRisk(create, { query: noQuery, body: { status } }))

    expect(risks).toEqual(['publish', 'publish'])
  })

  it('returns write for content.create when status is absent, another value, or the body is not an object', () => {
    const create = agentOperation('content.create')
    const bodies: unknown[] = [{}, { status: 'draft' }, { status: 'PUBLISHED' }, null, undefined, 'published', []]

    const risks = bodies.map(body => resolveOperationRisk(create, { query: noQuery, body }))

    expect(risks).toEqual(bodies.map(() => 'write'))
  })

  it('applies the same status rule to content.update', () => {
    const update = agentOperation('content.update')
    const bodies: unknown[] = [{ status: ' published ' }, { status: 'draft' }, undefined]

    const risks = bodies.map(body => resolveOperationRisk(update, { query: noQuery, body }))

    expect(risks).toEqual(['publish', 'write', 'write'])
  })

  it('returns destructive for content.delete only when purge is exactly true', () => {
    // Handler parity: delete.ts purges on query.purge === 'true' and trashes on anything else.
    const contentDelete = agentOperation('content.delete')
    const queries: OperationRiskInput['query'][] = [{ purge: 'true' }, {}, { purge: '1' }, { purge: 'false' }]

    const risks = queries.map(query => resolveOperationRisk(contentDelete, { query, body: undefined }))

    expect(risks).toEqual(['destructive', 'write', 'write', 'write'])
  })

  it('returns the static risk of an operation without a rule', () => {
    const operations = [agentOperation('trash.bulkPurge'), agentOperation('content.list')]

    const risks = operations.map(operation => resolveOperationRisk(operation, { query: noQuery, body: undefined }))

    expect(risks).toEqual(['destructive', 'read'])
  })
})
