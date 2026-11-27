// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

export type MfaEnrolmentStatus = 'pending' | 'active'

export interface MfaEnrolmentRecord {
  userId: string
  status: MfaEnrolmentStatus
  /** `v1:` envelope from IMfaSecretCipher. Never leaves the server. */
  secretCiphertext: string
  /** Last accepted TOTP step; null until the first accepted code. */
  lastUsedStep: number | null
  createdAt: number
  activatedAt: number | null
}

export interface IMfaEnrolmentRepository {
  findByUserId(userId: string): Promise<MfaEnrolmentRecord | null>

  /**
   * Creates the pending row, or replaces the secret of an existing PENDING row.
   * Returns false and changes nothing when the user's enrolment is already active.
   */
  savePending(userId: string, secretCiphertext: string, nowSeconds: number): Promise<boolean>

  /**
   * pending → active, records `step` as last used, and revokes every refresh token of the user
   * except the one whose hash is `keepSessionTokenHash` (null revokes none), all in one atomic write.
   * Applies only while the row is still pending with exactly `expectedCiphertext`; returns false otherwise
   * and then revokes nothing.
   */
  activate(userId: string, expectedCiphertext: string, step: number, nowSeconds: number, keepSessionTokenHash: string | null): Promise<boolean>

  /** Records `step` for an ACTIVE enrolment only when it is strictly greater than the last used step. */
  consumeStep(userId: string, step: number): Promise<boolean>

  /**
   * Deletes the enrolment (secret and replay state) and revokes every other refresh token, atomically.
   * Returns false and revokes nothing when the user has no enrolment.
   */
  remove(userId: string, nowSeconds: number, keepSessionTokenHash: string | null): Promise<boolean>
}
