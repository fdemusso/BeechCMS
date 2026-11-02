// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { IRoleRepository } from '@beechcms/core'
import type { Env, Variables } from '../../types'
import { rbacApp } from './index'

const roleRepository = {
  listAll: vi.fn<IRoleRepository['listAll']>(),
  create: vi.fn<IRoleRepository['create']>(),
}

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (context, next) => {
    context.set('jwtPayload', { sub: 'actor' } as Variables['jwtPayload'])
    context.set('effectivePermissions', { global: new Set(['manage_roles', 'content:read']), byScope: new Map() })
    // Only the methods the handler may call are provided; any other call fails loudly.
    context.set('roleRepository', roleRepository as unknown as IRoleRepository)
    await next()
  })
  app.route('/api/rbac', rbacApp)
  return app
}

function create() {
  return buildApp().request('/api/rbac/roles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Reviewer', permissions: ['content:read'] }),
  })
}

describe('createRoleHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    roleRepository.listAll.mockResolvedValue([])
  })

  it('creates the role without loading the whole role catalogue to check the name', async () => {
    roleRepository.create.mockResolvedValue('role-id')

    const response = await create()

    expect(response.status).toBe(201)
    expect(roleRepository.listAll).not.toHaveBeenCalled()
  })

  it('maps the UNIQUE name violation to 409 role-name-taken', async () => {
    roleRepository.create.mockRejectedValue(new Error('D1_ERROR: UNIQUE constraint failed: roles.name'))

    const response = await create()

    expect(response.status).toBe(409)
    expect(await response.json<{ type: string }>()).toMatchObject({ type: 'https://beechcms.dev/problems/role-name-taken' })
  })
})
