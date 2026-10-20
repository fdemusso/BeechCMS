// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useMemo } from "react"
import {
  GLOBAL_SCOPE,
  hasPermission,
  hasPermissionAnywhere,
  type EffectivePermissions,
  type Permission,
  type Scope,
} from "@beechcms/core"
import { useMe, type EffectivePermissionsPayload } from "./use-me"

/** Zero-trust default: no payload ⇒ no authority ⇒ every gated surface hidden. */
const NO_AUTHORITY: EffectivePermissions = {
  global: new Set<Permission>(),
  byScope: new Map<Scope, ReadonlySet<Permission>>(),
}

/** Rebuilds the Sets/Maps `@beechcms/core`'s evaluator expects from the JSON payload.
 *  Exported for tests; the hook is the only production caller. */
export function hydrateEffectivePermissions(
  payload: EffectivePermissionsPayload | undefined,
): EffectivePermissions {
  if (!payload) return NO_AUTHORITY
  return {
    global: new Set<Permission>(payload.global),
    byScope: new Map<Scope, ReadonlySet<Permission>>(
      Object.entries(payload.byScope).map(([scope, permissions]) => [
        scope,
        new Set<Permission>(permissions),
      ]),
    ),
  }
}

export interface PermissionsApi {
  /** The caller's authority, in the exact shape `permissionMiddleware` evaluates. */
  effective: EffectivePermissions
  /** May the caller do `permission` on `scope`? Delegates to core's `hasPermission`. */
  can: (permission: Permission, scope: Scope) => boolean
  /** Held on at least one scope — mirrors the API's `permission-any-scope` gate kind. */
  canAnywhere: (permission: Permission) => boolean
  /** Held at `'*'` — mirrors `perm(x, 'global')` rows in `PROTECTED_ROUTES`. */
  canGlobally: (permission: Permission) => boolean
  /** `users.role === 'admin'`. Gates the Seed Builder and NOTHING else. */
  isDeveloper: boolean
  /** Legal `scope` values for assignment/invitation creation by this caller. */
  manageableScopes: Scope[]
  isLoading: boolean
}

/**
 * The single source of UI visibility truth.
 *
 * Never re-implements the additive scope model: it rehydrates the payload and calls
 * `@beechcms/core`'s evaluator, the same functions `permissionMiddleware()` calls.
 * Client-side hiding is cosmetic — the server gate stays the enforcement point.
 */
export function usePermissions(): PermissionsApi {
  const { data, isLoading } = useMe()

  return useMemo(() => {
    const effective = hydrateEffectivePermissions(data?.permissions)
    return {
      effective,
      can: (permission: Permission, scope: Scope) => hasPermission(effective, permission, scope),
      canAnywhere: (permission: Permission) => hasPermissionAnywhere(effective, permission),
      canGlobally: (permission: Permission) => hasPermission(effective, permission, GLOBAL_SCOPE),
      isDeveloper: data?.isDeveloper === true,
      manageableScopes: data?.manageableScopes ?? [],
      isLoading,
    }
  }, [data, isLoading])
}
