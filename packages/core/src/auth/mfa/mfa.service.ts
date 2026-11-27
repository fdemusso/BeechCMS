// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { IClock } from '../../common/clock.js'
import type { IMfaEnrolmentRepository } from './mfa-enrolment.repository.js'
import type { IMfaSecretCipher } from './mfa-secret-cipher.js'
import type { ITotpProvider } from './totp.js'

export type MfaStatus = 'none' | 'pending' | 'active'

export interface MfaEnrolmentStart {
  /** Base32 secret, returned ONLY here (brief rule 8). */
  secret: string
  otpauthUri: string
}

export type MfaConfirmResult = 'activated' | 'invalid-code' | 'no-pending'
export type MfaVerifyResult = 'ok' | 'invalid' | 'not-active'

export interface MfaServiceDependencies {
  repository: IMfaEnrolmentRepository
  cipher: IMfaSecretCipher
  totp: ITotpProvider
  clock: IClock
  /** Issuer label in the authenticator app. */
  issuer: string
}

/** Issuer the API wires by default. */
export const MFA_DEFAULT_ISSUER = 'BeechCMS'

/**
 * Owns the MFA enrolment state machine (absent → pending → active).
 * Slices reach it only through the `mfaService` context variable.
 */
export interface IMfaService {
  /** Works without an encryption key: never touches the cipher. */
  getStatus(userId: string): Promise<MfaStatus>
  /** @throws MfaNotConfiguredError before any write when the encryption key is missing. */
  startEnrolment(userId: string, accountName: string): Promise<MfaEnrolmentStart | 'already-active'>
  /** Activates a pending enrolment and records the confirming code's step. */
  confirmEnrolment(userId: string, code: string, keepSessionTokenHash: string | null): Promise<MfaConfirmResult>
  /** Accepts each code at most once; never reveals why a code was invalid. */
  verifyCode(userId: string, code: string): Promise<MfaVerifyResult>
  /** The caller enforces fresh strong re-auth. Needs no encryption key. */
  disable(userId: string, keepSessionTokenHash: string | null): Promise<boolean>
}

export class MfaService implements IMfaService {
  private readonly repository: IMfaEnrolmentRepository
  private readonly cipher: IMfaSecretCipher
  private readonly totp: ITotpProvider
  private readonly clock: IClock
  private readonly issuer: string

  constructor(dependencies: MfaServiceDependencies) {
    this.repository = dependencies.repository
    this.cipher = dependencies.cipher
    this.totp = dependencies.totp
    this.clock = dependencies.clock
    this.issuer = dependencies.issuer
  }

  async getStatus(userId: string): Promise<MfaStatus> {
    const record = await this.repository.findByUserId(userId)
    return record?.status ?? 'none'
  }

  async startEnrolment(userId: string, accountName: string): Promise<MfaEnrolmentStart | 'already-active'> {
    const existing = await this.repository.findByUserId(userId)
    if (existing?.status === 'active') return 'already-active'

    const secret = this.totp.generateSecret()
    const secretCiphertext = await this.cipher.encrypt(secret, userId)
    const saved = await this.repository.savePending(userId, secretCiphertext, this.clock.nowSeconds())
    if (!saved) return 'already-active'

    return { secret, otpauthUri: this.totp.buildUri({ issuer: this.issuer, accountName, secret }) }
  }

  async confirmEnrolment(userId: string, code: string, keepSessionTokenHash: string | null): Promise<MfaConfirmResult> {
    const record = await this.repository.findByUserId(userId)
    if (!record || record.status !== 'pending') return 'no-pending'

    const now = this.clock.nowSeconds()
    const secret = await this.cipher.decrypt(record.secretCiphertext, userId)
    const step = await this.totp.verify(secret, code, now)
    if (step === null) return 'invalid-code'

    const activated = await this.repository.activate(userId, record.secretCiphertext, step, now, keepSessionTokenHash)
    return activated ? 'activated' : 'invalid-code'
  }

  async verifyCode(userId: string, code: string): Promise<MfaVerifyResult> {
    const record = await this.repository.findByUserId(userId)
    if (!record || record.status !== 'active') return 'not-active'

    const secret = await this.cipher.decrypt(record.secretCiphertext, userId)
    const step = await this.totp.verify(secret, code, this.clock.nowSeconds())
    if (step === null) return 'invalid'

    // A false result means the step was already used (replay) or a newer one was accepted.
    const consumed = await this.repository.consumeStep(userId, step)
    return consumed ? 'ok' : 'invalid'
  }

  async disable(userId: string, keepSessionTokenHash: string | null): Promise<boolean> {
    return this.repository.remove(userId, this.clock.nowSeconds(), keepSessionTokenHash)
  }
}
