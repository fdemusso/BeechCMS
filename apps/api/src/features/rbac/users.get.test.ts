// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { AccountSummary, IRoleAssignmentRepository, IUserRepository } from '@beechcms/core'
import { SystemIdGenerator } from '@beechcms/core'
import { CANONICAL_USERS } from '@beechcms/testing'
import type { Env, Variables } from '../../types'
import { rbacApp } from './index'

const account: AccountSummary = {
  id: CANONICAL_USERS.editor.id, email: CANONICAL_USERS.editor.email, name: null, surname: null,
  isActive: true, createdAt: 0,
}

const userRepository = {
  findAccountById: vi.fn<IUserRepository['findAccountById']>(),
  listAccounts: vi.fn<IUserRepository['listAccounts']>(),
}
const assignmentRepository = {
  listAllForUser: vi.fn<IRoleAssignmentRepository['listAllForUser']>(),
}

function buildApp() {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (context, next) => {
    context.set('idGenerator', SystemIdGenerator)
    context.set('jwtPayload', { sub: CANONICAL_USERS.admin.id } as Variables['jwtPayload'])
    context.set('effectivePermissions', { global: new Set(['manage_users']), byScope: new Map() })
    // Only the methods the handler may call are provided; any other call fails loudly.
    context.set('userRepository', userRepository as unknown as IUserRepository)
    context.set('roleAssignmentRepository', assignmentRepository as unknown as IRoleAssignmentRepository)
    await next()
  })
  app.route('/api/rbac', rbacApp)
  return app
}

describe('getUserHandler', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    assignmentRepository.listAllForUser.mockResolvedValue([])
    userRepository.listAccounts.mockResolvedValue([])
  })

  it('looks the account up by id instead of loading the whole accounts table', async () => {
    userRepository.findAccountById.mockResolvedValue(account)
    userRepository.listAccounts.mockResolvedValue([account])

    const response = await buildApp().request(`/api/rbac/users/${account.id}`)

    expect(response.status).toBe(200)
    expect(userRepository.findAccountById).toHaveBeenCalledWith(account.id)
    expect(userRepository.listAccounts).not.toHaveBeenCalled()
  })

  it('answers 404 when the account does not exist', async () => {
    userRepository.findAccountById.mockResolvedValue(null)

    const response = await buildApp().request(`/api/rbac/users/${account.id}`)

    expect(response.status).toBe(404)
  })
})
