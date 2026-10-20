// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { GLOBAL_SCOPE, type Permission, type Scope } from './permissions.js'
import type { EffectivePermissions, PermissionAssignment, RoleRecord } from './types.js'

/**
 * Folds a user's active assignments into their effective authority.
 *
 * The model is strictly additive: every assignment can only widen the result, and
 * assignments referencing an unknown role are ignored rather than treated as an error.
 *
 * @param assignments - Active assignments, already decay-filtered by the repository.
 * @param roles - The roles those assignments reference; extra roles are harmless.
 */
export function buildEffectivePermissions(
  assignments: readonly PermissionAssignment[],
  roles: readonly RoleRecord[],
): EffectivePermissions {
  const rolesById = new Map(roles.map(role => [role.id, role]))
  const global = new Set<Permission>()
  const byScope = new Map<Scope, Set<Permission>>()

  for (const assignment of assignments) {
    const role = rolesById.get(assignment.roleId)
    if (!role) continue

    if (assignment.scope === GLOBAL_SCOPE) {
      for (const permission of role.permissions) global.add(permission)
      continue
    }

    let bucket = byScope.get(assignment.scope)
    if (!bucket) {
      bucket = new Set<Permission>()
      byScope.set(assignment.scope, bucket)
    }
    for (const permission of role.permissions) bucket.add(permission)
  }

  return { global, byScope }
}

/**
 * Returns everything the caller may do within one scope: the union of their global
 * permissions and the permissions granted on that specific seed.
 */
export function permissionsForScope(
  effective: EffectivePermissions,
  scope: Scope,
): ReadonlySet<Permission> {
  if (scope === GLOBAL_SCOPE) return effective.global
  const scoped = effective.byScope.get(scope)
  if (!scoped) return effective.global
  return new Set<Permission>([...effective.global, ...scoped])
}

/**
 * The single authorization question: may this caller perform `permission` on `scope`?
 *
 * A global grant satisfies any scope. A scoped grant satisfies only its own seed and
 * never {@link GLOBAL_SCOPE} — that asymmetry is what stops horizontal escalation.
 */
export function hasPermission(
  effective: EffectivePermissions,
  permission: Permission,
  scope: Scope,
): boolean {
  if (effective.global.has(permission)) return true
  if (scope === GLOBAL_SCOPE) return false
  return effective.byScope.get(scope)?.has(permission) === true
}

/**
 * The anti-escalation rule: an actor may only hand out authority they already hold.
 *
 * A grant is legal only when the actor holds every permission being granted, at the
 * scope it is being granted on. Consequently an actor scoped to seed X can never mint
 * a global assignment, and can never include a permission absent from their own set —
 * regardless of what the role itself contains.
 *
 * @param actor - The granting user's effective authority.
 * @param targetScope - The scope the new assignment would apply to.
 * @param targetPermissions - The permissions carried by the role being assigned.
 */
export function canGrant(
  actor: EffectivePermissions,
  targetScope: Scope,
  targetPermissions: readonly Permission[],
): boolean {
  if (targetScope === GLOBAL_SCOPE) {
    return targetPermissions.every(permission => actor.global.has(permission))
  }
  const held = permissionsForScope(actor, targetScope)
  return targetPermissions.every(permission => held.has(permission))
}

/**
 * Every permission the actor holds at ANY scope — global or seed-scoped — folded into
 * one set.
 *
 * This is deliberately NOT an authorization primitive: it answers "could this actor
 * ever grant X somewhere", not "may this actor do X here". Only {@link hasPermission}
 * and {@link canGrant} answer the latter, and every route-level decision must keep
 * using them.
 */
export function permissionsHeldAnywhere(effective: EffectivePermissions): ReadonlySet<Permission> {
  const held = new Set<Permission>(effective.global)
  for (const bucket of effective.byScope.values()) {
    for (const permission of bucket) held.add(permission)
  }
  return held
}

/**
 * Whether the actor holds `permission` on at least one scope.
 *
 * Backs the coarse route gate for administration endpoints whose scope is not in the
 * URL: the gate keeps out callers with no administrative authority at all, and the
 * slice then makes the exact per-scope decision with {@link hasPermission} /
 * {@link canGrant}. Never use it as the final authorization check.
 */
export function hasPermissionAnywhere(
  effective: EffectivePermissions,
  permission: Permission,
): boolean {
  if (effective.global.has(permission)) return true
  for (const bucket of effective.byScope.values()) {
    if (bucket.has(permission)) return true
  }
  return false
}
