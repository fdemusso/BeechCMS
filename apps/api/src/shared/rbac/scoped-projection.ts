// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { EffectivePermissions, Permission, Scope, Seed } from '@beechcms/core'
import { hasPermission } from '@beechcms/core'

/**
 * The seeds a caller may exercise `permission` on, in registry order.
 *
 * The projection rule for every LISTING endpoint: a list returns exactly what the
 * caller could open one by one, never more. A global grant keeps the list whole; a
 * seed-scoped grant narrows it to that seed. An account with no assignment gets `[]`,
 * which is the zero-trust default (brief §2) rather than an error.
 *
 * Lives in `shared/` because four slices need the identical narrowing and a
 * slice-to-slice import would violate VSA — the same reason `effective-permissions.ts`
 * is here.
 */
export function filterSeedsByPermission(
  seeds: readonly Seed[],
  effective: EffectivePermissions,
  permission: Permission,
): Seed[] {
  if (effective.global.has(permission)) return [...seeds]
  return seeds.filter(seed => hasPermission(effective, permission, seed.slug))
}

/** Wire shape of a caller's authority. Sets/Maps are not JSON-serializable. */
export interface EffectivePermissionsPayload {
  /** Permissions held at `'*'`; they apply to every seed, present and future. */
  global: Permission[]
  /** Permissions held on a specific seed slug, keyed by that slug. */
  byScope: Record<Scope, Permission[]>
}

/**
 * Serializes `EffectivePermissions` for the dashboard.
 *
 * Deterministically sorted so a client may compare two payloads by value (and so the
 * response is cache-stable). Emits the RAW authority — global and scoped kept apart —
 * never a pre-flattened "can I do X" list: flattening would lose the scope asymmetry
 * that `hasPermission()` depends on (a scoped grant never satisfies `'*'`).
 */
export function serializeEffectivePermissions(
  effective: EffectivePermissions,
): EffectivePermissionsPayload {
  const byScope: Record<Scope, Permission[]> = {}
  for (const scope of [...effective.byScope.keys()].sort()) {
    byScope[scope] = [...(effective.byScope.get(scope) ?? [])].sort()
  }
  return { global: [...effective.global].sort(), byScope }
}
