// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { GLOBAL_SCOPE, type Permission } from './permissions.js'
import type { PermissionAssignment, RoleRecord } from './types.js'
import { buildEffectivePermissions, permissionsForScope, hasPermission, canGrant } from './evaluate.js'

function role(id: string, permissions: Permission[]): RoleRecord {
  return {
    id,
    name: id,
    description: null,
    isSystem: false,
    permissions,
    createdAt: 0,
    updatedAt: 0,
  }
}

function assignment(roleId: string, scope: string): PermissionAssignment {
  return { id: `${roleId}-${scope}`, userId: 'u1', roleId, scope }
}

describe('buildEffectivePermissions', () => {
  it('unions two roles on the same scope additively', () => {
    const roles = [role('r1', ['content:read']), role('r2', ['content:create'])]
    const assignments = [assignment('r1', 'postsOnly'), assignment('r2', 'postsOnly')]

    const effective = buildEffectivePermissions(assignments, roles)

    expect(effective.byScope.get('postsOnly')).toEqual(new Set(['content:read', 'content:create']))
  })

  it('ignores an assignment whose roleId matches no supplied role', () => {
    const assignments = [assignment('missing', GLOBAL_SCOPE)]

    const effective = buildEffectivePermissions(assignments, [])

    expect(effective.global.size).toBe(0)
  })
})

describe('hasPermission', () => {
  it('a global grant returns true for an arbitrary seed slug', () => {
    const roles = [role('r1', ['content:read'])]
    const effective = buildEffectivePermissions([assignment('r1', GLOBAL_SCOPE)], roles)

    expect(hasPermission(effective, 'content:read', 'anySlug')).toBe(true)
  })

  it('a scope-postsOnly grant returns false for scope pages and for GLOBAL_SCOPE', () => {
    const roles = [role('r1', ['content:read'])]
    const effective = buildEffectivePermissions([assignment('r1', 'postsOnly')], roles)

    expect(hasPermission(effective, 'content:read', 'pages')).toBe(false)
    expect(hasPermission(effective, 'content:read', GLOBAL_SCOPE)).toBe(false)
  })
})

describe('permissionsForScope', () => {
  it('returns the union of global and scoped permissions', () => {
    const roles = [role('r1', ['content:read']), role('r2', ['content:create'])]
    const effective = buildEffectivePermissions(
      [assignment('r1', GLOBAL_SCOPE), assignment('r2', 'postsOnly')],
      roles,
    )

    expect(permissionsForScope(effective, 'postsOnly')).toEqual(
      new Set(['content:read', 'content:create']),
    )
  })
})

describe('canGrant', () => {
  it('rejects a global target when the actor holds the permission only on a seed', () => {
    const roles = [role('r1', ['manage_roles'])]
    const actor = buildEffectivePermissions([assignment('r1', 'postsOnly')], roles)

    expect(canGrant(actor, GLOBAL_SCOPE, ['manage_roles'])).toBe(false)
  })

  it('rejects a target permission the actor lacks entirely, even at the actor own scope', () => {
    const roles = [role('r1', ['content:read'])]
    const actor = buildEffectivePermissions([assignment('r1', 'postsOnly')], roles)

    expect(canGrant(actor, 'postsOnly', ['manage_roles'])).toBe(false)
  })

  it('accepts a target that is a strict subset of what the actor holds there', () => {
    const roles = [role('r1', ['content:read', 'content:create'])]
    const actor = buildEffectivePermissions([assignment('r1', 'postsOnly')], roles)

    expect(canGrant(actor, 'postsOnly', ['content:read'])).toBe(true)
  })
})
