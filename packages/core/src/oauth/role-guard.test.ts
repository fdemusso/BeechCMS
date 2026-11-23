// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { AllowAllRoleGuard, PermissionRoleGuard } from './role-guard.js'
import { OAUTH_SCOPES, type OAuthScope } from './scopes.js'
import { PERMISSIONS, type Permission } from '../rbac/permissions.js'
import type { EffectivePermissions } from '../rbac/types.js'

const REQUESTED: OAuthScope[] = ['schema:read', 'schema:write']

const EMPTY: EffectivePermissions = { global: new Set(), byScope: new Map() }
const FULL_AUTHORITY: EffectivePermissions = { global: new Set(PERMISSIONS), byScope: new Map() }
const AUTHENTICATED_SCOPES: OAuthScope[] = [
  'schema:read', 'content:read', 'content:write', 'settings:read', 'settings:write', 'analytics:read', 'agent:read', 'agent:approve',
]

const globalHolder = (permission: Permission): EffectivePermissions => ({ global: new Set([permission]), byScope: new Map() })

describe('AllowAllRoleGuard', () => {
  it('grants every requested scope regardless of authority', async () => {
    const decision = await new AllowAllRoleGuard().arbitrate(EMPTY, REQUESTED)
    expect(decision).toEqual({ grantedScopes: REQUESTED, deniedScopes: [] })
  })
})

describe('PermissionRoleGuard', () => {
  it('grants every requested scope to a holder of every permission at the global scope', async () => {
    const decision = await new PermissionRoleGuard().arbitrate(FULL_AUTHORITY, OAUTH_SCOPES)
    expect(decision).toEqual({ grantedScopes: [...OAUTH_SCOPES], deniedScopes: [] })
  })

  it('grants only the authenticated scopes to an account with no permission', async () => {
    const decision = await new PermissionRoleGuard().arbitrate(EMPTY, OAUTH_SCOPES)
    expect(decision.grantedScopes).toEqual(OAUTH_SCOPES.filter(scope => AUTHENTICATED_SCOPES.includes(scope)))
    expect(decision.deniedScopes).toEqual(OAUTH_SCOPES.filter(scope => !AUTHENTICATED_SCOPES.includes(scope)))
  })

  it.each([
    ['manage_seeds', { grantedScopes: ['schema:write'], deniedScopes: [] }],
    ['manage_users', { grantedScopes: [], deniedScopes: ['schema:write'] }],
  ] as const)('with %s at the global scope decides schema:write as %j', async (permission, expected) => {
    // Schema writes were the only 1.x delegation and must stay gated.
    const decision = await new PermissionRoleGuard().arbitrate(globalHolder(permission), ['schema:write'])
    expect(decision).toEqual(expected)
  })

  it('counts a seed-scoped permission towards the scope', async () => {
    const scopedReader: EffectivePermissions = {
      global: new Set(),
      byScope: new Map([['posts', new Set<Permission>(['content:read'])]]),
    }

    const decision = await new PermissionRoleGuard().arbitrate(scopedReader, ['media:read', 'automations:read', 'content:delete'])

    expect(decision).toEqual({ grantedScopes: ['media:read', 'automations:read'], deniedScopes: ['content:delete'] })
  })

  it('never grants a scope that was not requested', async () => {
    const decision = await new PermissionRoleGuard().arbitrate(FULL_AUTHORITY, ['content:read'])
    expect(decision).toEqual({ grantedScopes: ['content:read'], deniedScopes: [] })
  })
})
