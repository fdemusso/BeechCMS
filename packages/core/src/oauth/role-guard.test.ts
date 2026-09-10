// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { AllowAllRoleGuard, PermissionRoleGuard } from './role-guard.js'
import type { OAuthScope } from './scopes.js'
import type { EffectivePermissions } from '../rbac/types.js'

const REQUESTED: OAuthScope[] = ['schema:read', 'schema:write']

const EMPTY: EffectivePermissions = { global: new Set(), byScope: new Map() }
const GLOBAL_ADMIN: EffectivePermissions = { global: new Set(['manage_users']), byScope: new Map() }
const SCOPED_ADMIN: EffectivePermissions = {
  global: new Set(),
  byScope: new Map([['posts', new Set(['manage_users'])]]),
}

describe('AllowAllRoleGuard', () => {
  it('grants every requested scope regardless of authority', async () => {
    const decision = await new AllowAllRoleGuard().arbitrate(EMPTY, REQUESTED)
    expect(decision).toEqual({ grantedScopes: REQUESTED, deniedScopes: [] })
  })
})

describe('PermissionRoleGuard', () => {
  it('grants all when global authority contains manage_users', async () => {
    const decision = await new PermissionRoleGuard().arbitrate(GLOBAL_ADMIN, REQUESTED)
    expect(decision).toEqual({ grantedScopes: REQUESTED, deniedScopes: [] })
  })

  it('denies all for an empty authority', async () => {
    const decision = await new PermissionRoleGuard().arbitrate(EMPTY, REQUESTED)
    expect(decision).toEqual({ grantedScopes: [], deniedScopes: REQUESTED })
  })

  it('denies all for a caller holding manage_users only at a seed scope', async () => {
    const decision = await new PermissionRoleGuard().arbitrate(SCOPED_ADMIN, REQUESTED)
    expect(decision).toEqual({ grantedScopes: [], deniedScopes: REQUESTED })
  })
})
