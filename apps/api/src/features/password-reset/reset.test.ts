// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { FixedClock } from '@beechcms/testing'
import { passwordResetApp } from './index'

vi.mock('../../shared/email', () => ({
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  resolveEmailLocale: () => 'en',
}))

const FIXED_NOW_MS = Date.UTC(2026, 0, 1)

function buildApp() {
  const app = new Hono()
  const passwordResetTokenRepository = {
    findValidByHashWithEmail: vi.fn().mockResolvedValue({ id: 'prt-1', userId: 'u1', email: 'known@beechcms.com' }),
    redeem: vi.fn().mockResolvedValue(true),
  }
  const rateLimiters = {
    getLimiter: () => ({ checkLimit: vi.fn().mockResolvedValue({ isAllowed: true }) }),
  }

  app.use('*', async (c, next) => {
    c.set('passwordResetTokenRepository' as never, passwordResetTokenRepository)
    c.set('rateLimiters' as never, rateLimiters)
    c.set('clock' as never, new FixedClock(FIXED_NOW_MS))
    c.set('hashProvider' as never, { hash: vi.fn().mockResolvedValue('hashed-password') })
    await next()
  })
  app.route('/', passwordResetApp)

  return { app, passwordResetTokenRepository }
}

describe('resetPassword', () => {
  it('validates and redeems the token against the injected clock', async () => {
    const { app, passwordResetTokenRepository } = buildApp()

    const response = await app.request(
      '/auth/reset-password',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'plain-token', password: 'a-valid-password' }),
      },
      { RESEND_API_KEY: 'test-key', ENV: 'test' },
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    )

    expect(response.status).toBe(200)
    const nowSeconds = FIXED_NOW_MS / 1000
    expect(passwordResetTokenRepository.findValidByHashWithEmail).toHaveBeenCalledWith(expect.any(String), nowSeconds)
    expect(passwordResetTokenRepository.redeem).toHaveBeenCalledWith(expect.objectContaining({ nowTimestamp: nowSeconds }))
  })
})
