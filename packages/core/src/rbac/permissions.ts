// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * The closed atomic permission vocabulary.
 *
 * This tuple is the single source of truth for what a role may contain. It is
 * CLOSED BY DESIGN: new permissions arrive only as a developer code change plus a
 * migration widening the `role_permissions` CHECK constraint. Nothing at runtime —
 * no API, no plugin, no dashboard screen — may extend it.
 *
 * `manage_seeds` (or any schema-mutation permission) is deliberately absent and must
 * never be added. Seed schema mutation stays a developer capability exercised outside
 * the dashboard, via CLI and migrations.
 *
 * Each non-CRUD dashboard surface owns one dedicated permission (`view_analytics` is
 * the first). Absence of the permission hides the surface; there is no default-visible
 * exception.
 */
export const PERMISSIONS = [
  'content:read',
  'content:create',
  'content:update',
  'content:delete',
  'manage_users',
  'manage_roles',
  'view_analytics',
] as const

/** A single atomic permission drawn from the closed vocabulary. */
export type Permission = (typeof PERMISSIONS)[number]

/**
 * The sentinel scope granting a permission across every seed, present and future.
 * Reserved for cross-cutting coordination roles (e.g. SuperAdmin).
 */
export const GLOBAL_SCOPE = '*'

/**
 * A permission perimeter: either {@link GLOBAL_SCOPE} or a `seeds.slug`.
 * Isolation is per-seed, never row-level.
 */
export type Scope = string

/** Narrows an arbitrary string to a known permission. */
export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value)
}

/**
 * Name of the system role seeded by `0000_v040_base.sql` with the full permission set.
 *
 * `roles.name` is UNIQUE, so the name is a stable handle; the id is minted by the
 * migration and differs per database, which is why nothing may hardcode it.
 */
export const SUPER_ADMIN_ROLE_NAME = 'SuperAdmin'
