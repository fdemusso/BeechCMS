// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Frozen error-code map for the RBAC administration slice, following the
 * `auth/constants.ts` / `oauth/constants.ts` convention: one map per slice, codes never
 * renamed once shipped (the dashboard branches on them from sprint 5 on).
 */
export const RBAC_ERRORS = {
  /** Request body is not valid JSON. */
  INVALID_JSON: 'invalid-json',
  /** Body failed schema validation. */
  VALIDATION_FAILED: 'validation-failed',
  /** Target does not exist, or the caller may not see it (deliberately indistinguishable). */
  NOT_FOUND: 'not-found',
  /** The caller holds administrative authority, but not over this target. */
  FORBIDDEN: 'forbidden',
  /** The operation would hand out authority the caller does not itself hold. */
  ESCALATION_REFUSED: 'escalation-refused',
  /** Email already registered to another account. */
  EMAIL_TAKEN: 'email-taken',
  /** `roles.name` is UNIQUE and already used. */
  ROLE_NAME_TAKEN: 'role-name-taken',
  /** System roles are seeded by migration and immutable at runtime. */
  SYSTEM_ROLE_IMMUTABLE: 'system-role-immutable',
  /** Refused: would leave the platform with no active global administrator. */
  LAST_GLOBAL_ADMIN: 'last-global-admin',
  /** Scope is neither `'*'` nor the slug of an active seed. */
  UNKNOWN_SCOPE: 'unknown-scope',
} as const

export type RbacErrorCode = (typeof RBAC_ERRORS)[keyof typeof RBAC_ERRORS]
