// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'
import type { Permission } from '../rbac/permissions.js'
import { permissionsHeldAnywhere } from '../rbac/evaluate.js'
import type { EffectivePermissions } from '../rbac/types.js'

/** Outcome of a role arbitration. `deniedScopes` is empty when fully granted. */
export interface ScopeGrantDecision {
  grantedScopes: OAuthScope[]
  deniedScopes: OAuthScope[]
}

/**
 * Arbitrates which of the requested scopes a given caller may grant.
 *
 * This is the ONLY place role-based authorization may live in the OAuth flow.
 * `/oauth/authorize` and `/oauth/token` must never branch on authority themselves.
 *
 * The parameter is the caller's RESOLVED authority, not a role string: the role
 * string is the pre-RBAC vocabulary and is on its way out.
 */
export interface IRoleGuard {
  /**
   * @param effective - The resource owner's effective permissions, already folded.
   * @param requestedScopes - Scopes the client asked for, already validated.
   */
  arbitrate(
    effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision>
}

/**
 * Stub guard: grants every requested scope to every caller.
 *
 * Retained as the explicit, directly-tested permissive baseline and as the test
 * double for suites that are not exercising arbitration. It is NO LONGER the
 * production binding — `repositoryMiddleware` binds {@link PermissionRoleGuard}.
 */
export class AllowAllRoleGuard implements IRoleGuard {
  async arbitrate(
    _effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}

/**
 * RBAC authority that makes each OAuth scope usable, derived from the route rules of the
 * scope's `agent` operations: `'authenticated'` when at least one of them is open to any
 * active account, otherwise the permissions (any one, at any scope) those routes demand.
 * Kept in sync with PROTECTED_ROUTES by apps/api/src/factory.operations-parity.test.ts.
 */
export const SCOPE_GRANT_REQUIREMENTS: Readonly<Record<OAuthScope, readonly Permission[] | 'authenticated'>> = {
  'schema:read': 'authenticated',
  'schema:write': ['manage_seeds'],
  'content:read': 'authenticated',
  'content:write': 'authenticated',
  'content:delete': ['content:delete'],
  'media:read': ['content:read'],
  'media:write': ['content:create', 'content:delete'],
  'automations:read': ['content:read'],
  'automations:write': ['content:delete', 'content:update'],
  'users:read': ['manage_roles', 'manage_users'],
  'users:write': ['manage_roles', 'manage_users'],
  'settings:read': 'authenticated',
  'settings:write': 'authenticated',
  'analytics:read': 'authenticated',
  'agent:read': 'authenticated',
  'agent:approve': 'authenticated',
}

/**
 * Production guard: grants each requested scope whose {@link SCOPE_GRANT_REQUIREMENTS}
 * the owner meets on at least one RBAC scope. Delegation requires the authority it delegates,
 * evaluated per OAuth scope, so the outcome is a partial grant.
 *
 * RBAC remains the runtime authority (`permissionMiddleware`); this guard only refuses scopes
 * the owner could never use. Never grants a scope that was not requested.
 */
export class PermissionRoleGuard implements IRoleGuard {
  async arbitrate(
    effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    const held = permissionsHeldAnywhere(effective)
    const grantedScopes: OAuthScope[] = []
    const deniedScopes: OAuthScope[] = []
    for (const scope of requestedScopes) {
      const requirement = SCOPE_GRANT_REQUIREMENTS[scope]
      const isGranted = requirement === 'authenticated' || requirement.some(permission => held.has(permission))
      ;(isGranted ? grantedScopes : deniedScopes).push(scope)
    }
    return { grantedScopes, deniedScopes }
  }
}
