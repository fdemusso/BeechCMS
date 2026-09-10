// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Scope } from './permissions.js'

/** One invitation row. `tokenHash` is deliberately absent: nothing above the storage
 *  boundary ever needs it, and an administration listing must not carry credential
 *  material (same rule as AccountSummary omitting passwordHash). */
export interface InvitationRecord {
  id: string
  email: string
  roleId: string
  scope: Scope
  invitedBy: string
  expiresAt: number
  createdAt: number
  /** Non-null once redeemed. Single-use is enforced by {@link IInvitationRepository.markUsed}. */
  usedAt: number | null
}

export interface NewInvitationInput {
  email: string
  tokenHash: string
  roleId: string
  scope: Scope
  invitedBy: string
  expiresAt: number
}

/** A live invitation resolved from a bearer token, with the pre-assignment it carries. */
export interface ValidatedInvitation {
  id: string
  email: string
  roleId: string
  scope: Scope
  invitedBy: string
}

/**
 * Storage contract for onboarding invitations.
 *
 * Deliberately shaped after {@link IPasswordResetTokenRepository}: a single-use,
 * expiring, hash-only bearer credential is the same lifecycle, and the codebase keeps
 * exactly one shape for it.
 */
export interface IInvitationRepository {
  /** Consumes every pending invitation for an email before a new one is issued, so at
   *  most one live token per address exists at any time. */
  invalidatePending(email: string, nowTimestamp: number): Promise<void>

  /** Stores a new invitation. Only the hash is persisted, never the plaintext.
   *  Returns the new invitation id. */
  create(input: NewInvitationInput): Promise<string>

  /** Resolves a live (unused, unexpired) invitation by token hash. Null otherwise —
   *  expired, already used and unknown are deliberately indistinguishable. */
  findValidByHash(tokenHash: string, nowTimestamp: number): Promise<ValidatedInvitation | null>

  /**
   * Consumes an invitation. Returns TRUE only when THIS call performed the transition
   * (`used_at IS NULL` at write time), which is what makes redemption single-use under
   * concurrency. A second concurrent redeem gets false and must be refused.
   */
  markUsed(invitationId: string, nowTimestamp: number): Promise<boolean>

  /** One invitation by id, regardless of state. Null when absent. */
  findById(invitationId: string): Promise<InvitationRecord | null>

  /** Every invitation, newest first. Administration tables are small by nature. */
  listAll(): Promise<InvitationRecord[]>

  /** Replaces the token and expiry of an existing PENDING-or-EXPIRED invitation,
   *  preserving its (role, scope, email) pre-assignment. Returns false when the row is
   *  absent or already used — a consumed invitation is never re-armed. */
  regenerate(invitationId: string, tokenHash: string, expiresAt: number): Promise<boolean>

  /** Revokes (hard-deletes) an invitation. Returns false when it did not exist. */
  delete(invitationId: string): Promise<boolean>
}
