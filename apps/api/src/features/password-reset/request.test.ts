// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { requestPasswordReset } from './request'

const { sendPasswordResetEmailMock } = vi.hoisted(() => ({
  sendPasswordResetEmailMock: vi.fn(),
}))

vi.mock('../../shared/email', () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  resolveEmailLocale: () => 'en',
}))

// ─── App builder ─────────────────────────────────────────────────────────────

function buildApp(opts: {
  userRepository?: any
  passwordResetTokenRepository?: any
} = {}) {
  const app = new Hono()
  const userRepository = opts.userRepository ?? {
    findByEmail: vi.fn().mockResolvedValue(null),
  }
  const passwordResetTokenRepository = opts.passwordResetTokenRepository ?? {
    invalidatePending: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(undefined),
  }
  const rateLimiters = {
    getLimiter: () => ({ checkLimit: vi.fn().mockResolvedValue({ isAllowed: true }) }),
  }

  app.use('*', async (c, next) => {
    c.set('userRepository' as never, userRepository)
    c.set('passwordResetTokenRepository' as never, passwordResetTokenRepository)
    c.set('rateLimiters' as never, rateLimiters)
    await next()
  })
  app.post('/auth/forgot-password', requestPasswordReset)

  const defaultEnv = { RESEND_API_KEY: 'test-key', ENV: 'test' }
  const originalRequest = app.request.bind(app)
  app.request = ((input: any, init?: any, env?: any, executionCtx?: any) =>
    originalRequest(input, init, env ?? defaultEnv, executionCtx)) as typeof app.request

  return { app, userRepository, passwordResetTokenRepository }
}

function postForgotPassword(app: Hono, email: string, executionCtx?: any) {
  return app.request(
    '/auth/forgot-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    undefined,
    executionCtx
  )
}

describe('POST /auth/forgot-password', () => {
  beforeEach(() => {
    sendPasswordResetEmailMock.mockReset()
  })

  it('does not block the response on the email send (timing side-channel fix)', async () => {
    let resolveEmailSend: () => void = () => {}
    sendPasswordResetEmailMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEmailSend = resolve
      })
    )

    const waitUntil = vi.fn()
    const { app, userRepository } = buildApp({
      userRepository: { findByEmail: vi.fn().mockResolvedValue({ id: 'u1' }) },
    })

    const res = await postForgotPassword(app, 'known@beechcms.com', { waitUntil })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(userRepository.findByEmail).toHaveBeenCalledWith('known@beechcms.com')
    // Handler must hand the email send to waitUntil instead of awaiting it inline —
    // the response above only resolved because the send was NOT awaited.
    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1)

    resolveEmailSend()
  }, 2000)

  it('returns the same success body for an unknown email without sending an email', async () => {
    sendPasswordResetEmailMock.mockResolvedValue(undefined)
    const waitUntil = vi.fn()
    const { app, passwordResetTokenRepository } = buildApp()

    const res = await postForgotPassword(app, 'unknown@beechcms.com', { waitUntil })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(passwordResetTokenRepository.create).not.toHaveBeenCalled()
    expect(waitUntil).not.toHaveBeenCalled()
    expect(sendPasswordResetEmailMock).not.toHaveBeenCalled()
  })
})
