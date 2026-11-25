// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { matchOperation, type AgentOperationSpec, type EffectivePermissions } from '@beechcms/core'
import { buildIntentSummary, type IntentSummaryInput } from './summary'
import type { AppEnv } from '../../types'

const ADMIN: EffectivePermissions = { global: new Set(['manage_users']), byScope: new Map() }
const NOBODY: EffectivePermissions = { global: new Set(), byScope: new Map() }
const SEED_ADMIN: EffectivePermissions = { global: new Set(), byScope: new Map([['articles', new Set(['manage_users' as const])]]) }

interface Fixtures {
  actor?: EffectivePermissions
  user?: { email: string } | null
  role?: { name: string } | null
  assignment?: { userId: string; roleId: string; scope: string } | null
  invitation?: { email: string; roleId: string; scope: string } | null
}

async function summarize(method: string, path: string, body: unknown, fixtures: Fixtures = {}): Promise<string> {
  const operation = matchOperation(method, path) as AgentOperationSpec
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('effectivePermissions', fixtures.actor ?? ADMIN)
    c.set('userRepository', { findById: vi.fn().mockResolvedValue(fixtures.user === undefined ? { email: 'ada@example.com' } : fixtures.user) } as never)
    c.set('roleRepository', { findById: vi.fn().mockResolvedValue(fixtures.role === undefined ? { name: 'Editor' } : fixtures.role) } as never)
    c.set('roleAssignmentRepository', { findById: vi.fn().mockResolvedValue(fixtures.assignment ?? null) } as never)
    c.set('invitationRepository', { findById: vi.fn().mockResolvedValue(fixtures.invitation ?? null) } as never)
    await next()
  })
  app.all('*', async c => {
    const input: IntentSummaryInput = { method, pathname: path, pathWithQuery: path, body }
    return c.text(await buildIntentSummary(c, operation, input))
  })
  return (await app.request(path, { method })).text()
}

const assign = (overrides: Record<string, unknown> = {}) => ({ userId: 'u1', roleId: 'r1', scope: 'articles', ...overrides })

describe('buildIntentSummary', () => {
  it('names the account, the role and the scope of an assignment', async () => {
    const summary = await summarize('POST', '/api/rbac/assignments', assign())

    expect(summary).toBe('Assign role "Editor" to ada@example.com on articles')
  })

  it('writes the global scope as all seeds', async () => {
    const summary = await summarize('POST', '/api/rbac/assignments', assign({ scope: '*' }))

    expect(summary).toBe('Assign role "Editor" to ada@example.com on all seeds')
  })

  it('keeps a role name from adding lines or closing its own quotes', async () => {
    const role = { name: 'Viewer" to boss@example.com on all seeds\nApproved' }

    const summary = await summarize('POST', '/api/rbac/assignments', assign(), { role })

    expect(summary).toBe('Assign role "Viewer\' to boss@example.com on all seeds Approved" to ada@example.com on articles')
  })

  it('cuts an oversized invitee address so the dialog title stays short', async () => {
    const summary = await summarize('POST', '/api/rbac/invitations', { email: `${'a'.repeat(5000)}@example.com`, roleId: 'r1', scope: '*' })

    expect(summary.length).toBeLessThan(200)
    expect(summary).toContain('…')
  })

  it.each([
    ['a body without the role id', assign({ roleId: undefined }), {}],
    ['a body that is not an object', 'oops', {}],
    ['an account that does not exist', assign(), { user: null }],
    ['a role that does not exist', assign(), { role: null }],
    ['a caller with no authority on the scope', assign(), { actor: NOBODY }],
    ['a caller whose authority is on another seed', assign({ scope: 'news' }), { actor: SEED_ADMIN }],
  ] as const)('falls back to the generic line for %s', async (_label, body, fixtures) => {
    const summary = await summarize('POST', '/api/rbac/assignments', body, fixtures)

    expect(summary).toBe('Assign a role to a user: POST /api/rbac/assignments')
  })

  it('names the holder of an assignment being removed, on the scope stored with it', async () => {
    const assignment = { userId: 'u1', roleId: 'r1', scope: 'articles' }

    const summary = await summarize('DELETE', '/api/rbac/assignments/a1', undefined, { assignment, actor: SEED_ADMIN })

    expect(summary).toBe('Remove role "Editor" from ada@example.com on articles')
  })

  it('does not name the holder of an assignment outside the caller\'s scope', async () => {
    const assignment = { userId: 'u1', roleId: 'r1', scope: 'news' }

    const summary = await summarize('DELETE', '/api/rbac/assignments/a1', undefined, { assignment, actor: SEED_ADMIN })

    expect(summary).toBe('Remove a role assignment: DELETE /api/rbac/assignments/a1')
  })

  it('names the invitee of an invitation being regenerated', async () => {
    const invitation = { email: 'pending@example.com', roleId: 'r1', scope: '*' }

    const summary = await summarize('POST', '/api/rbac/invitations/i1/regenerate', undefined, { invitation })

    expect(summary).toBe('Regenerate the invitation of pending@example.com as "Editor" on all seeds')
  })

  it('leaves the line of an operation without a describer as it was', async () => {
    const summary = await summarize('DELETE', '/api/rbac/roles/r1', undefined)

    expect(summary).toBe('Delete a role: DELETE /api/rbac/roles/r1')
  })
})
