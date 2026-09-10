// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Permission, Scope } from './permissions.js'

/** A named, reusable bundle of atomic permissions. */
export interface RoleRecord {
  id: string
  name: string
  description: string | null
  icon?: string | null
  /** System roles (e.g. SuperAdmin) are seeded by migration and may not be deleted. */
  isSystem: boolean
  /** Always a subset of `PERMISSIONS`; unknown values are dropped at the storage boundary. */
  permissions: Permission[]
  createdAt: number
  updatedAt: number
}

/** One (user, role, scope) triple. A user may hold N independent assignments. */
export interface PermissionAssignment {
  id: string
  userId: string
  roleId: string
  scope: Scope
}

export interface NewRoleInput {
  name: string
  description: string | null
  icon?: string | null
  permissions: readonly Permission[]
}

export interface NewAssignmentInput {
  userId: string
  roleId: string
  scope: Scope
}

/**
 * A caller's resolved authority, computed once per request from their active
 * assignments. Purely additive: there is no negative permission and no conflict
 * resolution between roles.
 */
export interface EffectivePermissions {
  /** Permissions held at {@link GLOBAL_SCOPE}; they apply to every seed. */
  global: ReadonlySet<Permission>
  /** Permissions held at a specific seed slug, keyed by that slug. */
  byScope: ReadonlyMap<Scope, ReadonlySet<Permission>>
}

/** Storage contract for roles and their permission bundles. */
export interface IRoleRepository {
  /** Retrieves a role with its permissions, or null when it does not exist. */
  findById(roleId: string): Promise<RoleRecord | null>

  /** Retrieves several roles in one round trip. Missing ids are simply absent. */
  findByIds(roleIds: readonly string[]): Promise<RoleRecord[]>

  /** Lists every role, system roles included, ordered by name. */
  listAll(): Promise<RoleRecord[]>

  /** Creates a role and its permission rows atomically. Returns the new role id. */
  create(input: NewRoleInput): Promise<string>

  /**
   * Replaces a role's name, description and full permission set atomically.
   *
   * Returns false — changing NOTHING, permissions included — when the role does not
   * exist or is a system role. System roles are seeded by migration and are immutable
   * in both halves of the write, which is the guarantee callers rely on to keep
   * `SuperAdmin` intact.
   */
  update(roleId: string, input: NewRoleInput): Promise<boolean>

  /**
   * Deletes a non-system role and, by cascade, its permissions and assignments.
   * Returns false when the role does not exist or is a system role.
   */
  delete(roleId: string): Promise<boolean>
}

/** Storage contract for (user, role, scope) assignments. */
export interface IRoleAssignmentRepository {
  /**
   * Lists a user's assignments that currently grant anything.
   *
   * An assignment is skipped when its scope names a seed that is absent or
   * `status != 'active'`, so scopes decay with their seed and revive with it.
   * {@link GLOBAL_SCOPE} assignments are always returned.
   */
  listActiveForUser(userId: string): Promise<PermissionAssignment[]>

  /** Lists every assignment referencing a role, decay filter NOT applied. */
  listByRole(roleId: string): Promise<PermissionAssignment[]>

  /** Creates an assignment. Returns its id; an existing identical triple is a no-op. */
  create(input: NewAssignmentInput): Promise<string>

  /** Removes one assignment. Returns false when it did not exist. */
  delete(assignmentId: string): Promise<boolean>

  /**
   * Counts accounts holding `manage_users` at {@link GLOBAL_SCOPE} and still active.
   * Backs the last-SuperAdmin guardrail consumed by a later sprint.
   */
  countActiveGlobalAdmins(): Promise<number>

  /** One assignment by id, decay filter NOT applied. Null when absent. */
  findById(assignmentId: string): Promise<PermissionAssignment | null>

  /**
   * Every assignment in the system, decay filter NOT applied.
   *
   * Exists so the account-list endpoint can resolve each account's scopes in ONE round
   * trip instead of one query per account. Administration tables are small by nature;
   * content never flows through here.
   */
  listAll(): Promise<PermissionAssignment[]>

  /**
   * Every assignment of one user, decay filter NOT applied — administration screens must
   * see (and be able to remove) a row whose seed is currently deleted, which
   * {@link listActiveForUser} deliberately hides.
   */
  listAllForUser(userId: string): Promise<PermissionAssignment[]>

  /**
   * {@link countActiveGlobalAdmins} ignoring one user. `0` means that user is the last
   * account able to administer the platform, and any operation revoking their authority
   * must be refused.
   */
  countActiveGlobalAdminsExcludingUser(userId: string): Promise<number>

  /**
   * {@link countActiveGlobalAdmins} ignoring every assignment that goes through one role.
   * `0` means mutating that role would strip the platform of its last administrator.
   */
  countActiveGlobalAdminsExcludingRole(roleId: string): Promise<number>
}
