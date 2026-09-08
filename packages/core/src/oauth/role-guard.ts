// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { OAuthScope } from './scopes.js'

/** Outcome of a role arbitration. `deniedScopes` is empty when fully granted. */
export interface ScopeGrantDecision {
  grantedScopes: OAuthScope[]
  deniedScopes: OAuthScope[]
}

/**
 * Arbitrates which of the requested scopes a given user role may grant.
 *
 * This is the ONLY place role-based authorization may live in the OAuth flow.
 * `/oauth/authorize` and `/oauth/token` must never branch on `role` themselves,
 * so introducing a real role system later requires swapping the implementation
 * bound in repositoryMiddleware and nothing else.
 */
export interface IRoleGuard {
  /**
   * @param role - The resource owner's role claim, or undefined when absent.
   * @param requestedScopes - Scopes the client asked for, already validated.
   */
  arbitrate(role: string | undefined, requestedScopes: readonly OAuthScope[]): Promise<ScopeGrantDecision>
}

/**
 * Stub guard for the pre-roles world: grants every requested scope to every role.
 *
 * This permissiveness is EXPLICIT and directly tested, not an accidental default.
 * When the roles feature lands, replace this binding with a real adapter; the
 * behaviour change will then be visible as a failing test here, by design.
 */
export class AllowAllRoleGuard implements IRoleGuard {
  async arbitrate(
    _role: string | undefined,
    requestedScopes: readonly OAuthScope[],
  ): Promise<ScopeGrantDecision> {
    return { grantedScopes: [...requestedScopes], deniedScopes: [] }
  }
}
