// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'
import { GLOBAL_SCOPE } from '../rbac/permissions.js'
import { hasPermission } from '../rbac/evaluate.js'
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
 * Production guard: only a holder of `manage_seeds` at {@link GLOBAL_SCOPE} may delegate
 * authority to an OAuth/MCP client.
 *
 * Every OAuth scope in this system (`schema:read`, `schema:write`) drives seed-schema
 * routes, which the route gate refuses to anyone without `manage_seeds@*`. So the question
 * this guard answers is the same one the `/api/seeds/*` rows ask: delegation requires the
 * authority it delegates. `manage_users@*` alone no longer suffices.
 *
 * A seed-scoped collaborator therefore cannot mint an MCP token, no matter which
 * scopes the client requests. Denial is all-or-nothing: there is no partial grant.
 */
export class PermissionRoleGuard implements IRoleGuard {
  async arbitrate(
    effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    if (!hasPermission(effective, 'manage_seeds', GLOBAL_SCOPE)) {
      return { grantedScopes: [], deniedScopes: [...requestedScopes] }
    }
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}
