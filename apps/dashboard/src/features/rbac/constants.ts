// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/** Mirror of the API's frozen `RBAC_ERRORS`. Codes are never renamed once shipped. */
export const RBAC_ERROR_CODES = {
  INVALID_JSON: 'invalid-json',
  VALIDATION_FAILED: 'validation-failed',
  NOT_FOUND: 'not-found',
  FORBIDDEN: 'forbidden',
  ESCALATION_REFUSED: 'escalation-refused',
  EMAIL_TAKEN: 'email-taken',
  ROLE_NAME_TAKEN: 'role-name-taken',
  SYSTEM_ROLE_IMMUTABLE: 'system-role-immutable',
  LAST_GLOBAL_ADMIN: 'last-global-admin',
  UNKNOWN_SCOPE: 'unknown-scope',
  EMAIL_UNAVAILABLE: 'email-unavailable',
  INVITATION_INVALID: 'invitation-invalid',
  INVITATION_REVOKED: 'invitation-revoked',
  INVITATION_ALREADY_USED: 'invitation-already-used',
} as const

export type RbacErrorCode = (typeof RBAC_ERROR_CODES)[keyof typeof RBAC_ERROR_CODES]

/**
 * Extracts the slice error code from an RFC 9457 body.
 * The API emits `type: "https://beechcms.dev/problems/<code>"`
 * (`apps/api/src/public/problem-details.ts#normalizeProblemType`).
 */
export function rbacErrorCode(error: unknown): RbacErrorCode | null {
  const type = (error as { response?: { data?: { type?: unknown } } })?.response?.data?.type
  if (typeof type !== 'string') return null
  const code = type.split('/').pop() ?? ''
  return (Object.values(RBAC_ERROR_CODES) as string[]).includes(code)
    ? (code as RbacErrorCode)
    : null
}
