// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { beforeEach, describe, expect, it } from 'vitest'
import { AesGcmMfaSecretCipher, MfaNotConfiguredError, UnconfiguredMfaSecretCipher } from './mfa-secret-cipher.js'
import type { IMfaEnrolmentRepository, MfaEnrolmentRecord } from './mfa-enrolment.repository.js'
import { MfaService } from './mfa.service.js'
import { generateTotpCode, totpStepAt, WebCryptoTotpProvider } from './totp.js'

const KEY_HEX = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f'
const FIRST_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const SECOND_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
const USER_ID = 'user_a'
const ACCOUNT_NAME = 'ada@example.com'
const START_SECONDS = 1_700_000_010
const SECONDS_PER_STEP = 30

/** Real TOTP verification with a fixed secret sequence, so fixtures hold no randomness. */
class SequencedSecretTotpProvider extends WebCryptoTotpProvider {
  constructor(private readonly secrets: string[]) {
    super()
  }

  override generateSecret(): string {
    const next = this.secrets.shift()
    if (!next) throw new Error('No fixture secret left')
    return next
  }
}

describe('MfaService', () => {
  let currentSeconds: number
  let records: Map<string, MfaEnrolmentRecord>
  let activateCalls: Array<{ userId: string; keepSessionTokenHash: string | null }>
  let removeCalls: Array<{ userId: string; keepSessionTokenHash: string | null }>
  let service: MfaService

  function createFakeRepository(): IMfaEnrolmentRepository {
    return {
      findByUserId: async userId => {
        const record = records.get(userId)
        return record ? { ...record } : null
      },
      savePending: async (userId, secretCiphertext, nowSeconds) => {
        const existing = records.get(userId)
        if (existing?.status === 'active') return false
        records.set(userId, {
          userId,
          status: 'pending',
          secretCiphertext,
          lastUsedStep: null,
          createdAt: existing?.createdAt ?? nowSeconds,
          activatedAt: null,
        })
        return true
      },
      activate: async (userId, expectedCiphertext, step, nowSeconds, keepSessionTokenHash) => {
        activateCalls.push({ userId, keepSessionTokenHash })
        const existing = records.get(userId)
        if (existing?.status !== 'pending' || existing.secretCiphertext !== expectedCiphertext) return false
        records.set(userId, { ...existing, status: 'active', lastUsedStep: step, activatedAt: nowSeconds })
        return true
      },
      consumeStep: async (userId, step) => {
        const existing = records.get(userId)
        if (existing?.status !== 'active') return false
        if (existing.lastUsedStep !== null && existing.lastUsedStep >= step) return false
        records.set(userId, { ...existing, lastUsedStep: step })
        return true
      },
      remove: async (userId, _nowSeconds, keepSessionTokenHash) => {
        removeCalls.push({ userId, keepSessionTokenHash })
        return records.delete(userId)
      },
    }
  }

  function createService(secrets: string[], cipher = new AesGcmMfaSecretCipher(KEY_HEX)): MfaService {
    return new MfaService({
      repository: createFakeRepository(),
      cipher,
      totp: new SequencedSecretTotpProvider(secrets),
      clock: { now: () => currentSeconds * 1000, nowSeconds: () => currentSeconds },
      issuer: 'BeechCMS',
    })
  }

  async function codeForStep(secret: string, stepOffset = 0): Promise<string> {
    return generateTotpCode(secret, totpStepAt(currentSeconds) + stepOffset)
  }

  /** Starts and confirms enrolment at the current time; the confirming step is consumed. */
  async function activateEnrolment(): Promise<void> {
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)
    await service.confirmEnrolment(USER_ID, await codeForStep(FIRST_SECRET), null)
  }

  function advanceOneStep(): void {
    currentSeconds += SECONDS_PER_STEP
  }

  beforeEach(() => {
    currentSeconds = START_SECONDS
    records = new Map()
    activateCalls = []
    removeCalls = []
    service = createService([FIRST_SECRET, SECOND_SECRET])
  })

  it('reports none, then pending after start, then active after confirm', async () => {
    const statuses = [await service.getStatus(USER_ID)]
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)
    statuses.push(await service.getStatus(USER_ID))
    await service.confirmEnrolment(USER_ID, await codeForStep(FIRST_SECRET), null)
    statuses.push(await service.getStatus(USER_ID))

    expect(statuses).toEqual(['none', 'pending', 'active'])
  })

  it('returns the secret and an otpauth URI only from startEnrolment and stores only ciphertext', async () => {
    const started = await service.startEnrolment(USER_ID, ACCOUNT_NAME)

    expect(started).toEqual({
      secret: FIRST_SECRET,
      otpauthUri: expect.stringContaining(`secret=${FIRST_SECRET}`),
    })
    const stored = records.get(USER_ID)
    expect(stored?.secretCiphertext.startsWith('v1:')).toBe(true)
    expect(stored?.secretCiphertext).not.toContain(FIRST_SECRET)
  })

  it('overwrites the pending secret when enrolment is started again', async () => {
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)

    const result = await service.confirmEnrolment(USER_ID, await codeForStep(FIRST_SECRET), null)

    expect(result).toBe('invalid-code')
    expect(records.get(USER_ID)?.status).toBe('pending')
  })

  it('refuses to start enrolment while MFA is active', async () => {
    await activateEnrolment()
    const before = { ...records.get(USER_ID) }

    const result = await service.startEnrolment(USER_ID, ACCOUNT_NAME)

    expect(result).toBe('already-active')
    expect(records.get(USER_ID)).toEqual(before)
  })

  it('throws mfa_not_configured on start without a key and writes nothing', async () => {
    const unconfigured = createService([FIRST_SECRET], new UnconfiguredMfaSecretCipher())

    const attempt = unconfigured.startEnrolment(USER_ID, ACCOUNT_NAME)

    await expect(attempt).rejects.toBeInstanceOf(MfaNotConfiguredError)
    expect(records.size).toBe(0)
  })

  it('reports status without a key', async () => {
    await activateEnrolment()
    const unconfigured = createService([], new UnconfiguredMfaSecretCipher())

    const status = await unconfigured.getStatus(USER_ID)

    expect(status).toBe('active')
  })

  it('rejects a wrong code at confirmation and stays pending', async () => {
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)
    const wrongCode = await codeForStep(FIRST_SECRET, 5)

    const result = await service.confirmEnrolment(USER_ID, wrongCode, null)

    expect(result).toBe('invalid-code')
    expect(records.get(USER_ID)?.status).toBe('pending')
  })

  it('returns no-pending when confirming without a pending enrolment', async () => {
    const result = await service.confirmEnrolment(USER_ID, '123456', null)

    expect(result).toBe('no-pending')
    expect(records.size).toBe(0)
  })

  it('treats a pending enrolment as not active at verification', async () => {
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)

    const result = await service.verifyCode(USER_ID, await codeForStep(FIRST_SECRET))

    expect(result).toBe('not-active')
  })

  it('accepts a valid code once and rejects the same code again', async () => {
    await activateEnrolment()
    advanceOneStep()
    const code = await codeForStep(FIRST_SECRET)

    const first = await service.verifyCode(USER_ID, code)
    // Regression guard: a replayed code must fail, or a shoulder-surfed code stays valid for its whole window.
    const second = await service.verifyCode(USER_ID, code)

    expect([first, second]).toEqual(['ok', 'invalid'])
  })

  it('rejects the confirmation code when reused for verification in the same step', async () => {
    await activateEnrolment()

    const result = await service.verifyCode(USER_ID, await codeForStep(FIRST_SECRET))

    expect(result).toBe('invalid')
  })

  it('rejects an older step after a newer one was accepted', async () => {
    await activateEnrolment()

    const result = await service.verifyCode(USER_ID, await codeForStep(FIRST_SECRET, -1))

    expect(result).toBe('invalid')
  })

  it('disables an active enrolment and reports none afterwards', async () => {
    await activateEnrolment()

    const removed = await service.disable(USER_ID, null)

    expect(removed).toBe(true)
    expect(await service.getStatus(USER_ID)).toBe('none')
  })

  it('passes the kept session hash through to activate', async () => {
    await service.startEnrolment(USER_ID, ACCOUNT_NAME)

    await service.confirmEnrolment(USER_ID, await codeForStep(FIRST_SECRET), 'session_hash_a')

    expect(activateCalls).toEqual([{ userId: USER_ID, keepSessionTokenHash: 'session_hash_a' }])
  })

  it('passes the kept session hash through to remove', async () => {
    await activateEnrolment()

    await service.disable(USER_ID, 'session_hash_b')

    expect(removeCalls).toEqual([{ userId: USER_ID, keepSessionTokenHash: 'session_hash_b' }])
  })
})
