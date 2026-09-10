// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'
import { GLOBAL_SCOPE } from '../rbac/permissions.js'
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
 * Production guard: only a platform-wide administrator may delegate authority to an
 * OAuth/MCP client.
 *
 * Every OAuth scope in this system (`schema:read`, `schema:write`) drives seed-schema
 * tooling, which brief §2 keeps OUT of the dashboard permission axis entirely — there is
 * deliberately no `manage_seeds` permission to map onto. So the question this guard
 * answers is not "which seed?" but "may this account hand platform authority to a
 * client at all?", and the marker for that is holding `manage_users` at
 * {@link GLOBAL_SCOPE} — the same SuperAdmin marker `countActiveGlobalAdmins()` uses.
 *
 * A seed-scoped collaborator therefore cannot mint an MCP token, no matter which
 * scopes the client requests. Denial is all-or-nothing: there is no partial grant.
 */
export class PermissionRoleGuard implements IRoleGuard {
  async arbitrate(
    effective: EffectivePermissions,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    if (!effective.global.has('manage_users')) {
      return { grantedScopes: [], deniedScopes: [...requestedScopes] }
    }
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}
