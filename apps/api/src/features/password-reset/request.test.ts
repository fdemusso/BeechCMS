// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { IIdGenerator } from '@beechcms/core'
import { sha256hex } from '@beechcms/core'
import { FixedClock } from '@beechcms/testing'
import { requestPasswordReset } from './request'

const { sendPasswordResetEmailMock } = vi.hoisted(() => ({
  sendPasswordResetEmailMock: vi.fn(),
}))

vi.mock('../../shared/email', () => ({
  sendPasswordResetEmail: sendPasswordResetEmailMock,
  resolveEmailLocale: () => 'en',
}))

// ─── App builder ─────────────────────────────────────────────────────────────

const FIXED_NOW_MS = Date.UTC(2026, 0, 1)
const FIXED_TOKEN = 'fixed-token-from-injected-generator'

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
  const clock = new FixedClock(FIXED_NOW_MS)
  const idGenerator: IIdGenerator = { uuid: () => FIXED_TOKEN, isValid: (value): value is string => typeof value === 'string' }

  app.use('*', async (c, next) => {
    c.set('userRepository' as never, userRepository)
    c.set('passwordResetTokenRepository' as never, passwordResetTokenRepository)
    c.set('rateLimiters' as never, rateLimiters)
    c.set('clock' as never, clock)
    c.set('idGenerator' as never, idGenerator)
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

    const scheduledTasks: Promise<unknown>[] = []
    const waitUntil = vi.fn((task: Promise<unknown>) => scheduledTasks.push(task))
    const { app, userRepository } = buildApp({
      userRepository: { findByEmail: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }) },
    })

    const res = await postForgotPassword(app, 'known@beechcms.com', { waitUntil })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(userRepository.findByEmail).toHaveBeenCalledWith('known@beechcms.com')
    // Handler must hand the token work and the email send to waitUntil instead of awaiting them
    // inline — the response above only resolved because the send is still pending.
    expect(waitUntil).toHaveBeenCalledTimes(1)

    resolveEmailSend()
    await Promise.all(scheduledTasks)
    expect(sendPasswordResetEmailMock).toHaveBeenCalledTimes(1)
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

  it('answers a known email before the token writes settle, so latency matches an unknown email', async () => {
    let settleTokenCreate: () => void = () => {}
    const passwordResetTokenRepository = {
      invalidatePending: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockReturnValue(
        new Promise<void>((resolve) => {
          settleTokenCreate = resolve
        })
      ),
    }
    const waitUntil = vi.fn()
    const { app } = buildApp({
      userRepository: { findByEmail: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }) },
      passwordResetTokenRepository,
    })

    const response = await postForgotPassword(app, 'known@beechcms.com', { waitUntil })

    // The response resolved while `create` was still pending: the D1 writes run inside waitUntil,
    // so a known account no longer takes measurably longer to answer than an unknown one.
    expect(response.status).toBe(200)
    expect(waitUntil).toHaveBeenCalledTimes(1)

    settleTokenCreate()
  }, 2000)

  it('stamps the token expiry from the injected clock', async () => {
    sendPasswordResetEmailMock.mockResolvedValue(undefined)
    const tasks: Promise<unknown>[] = []
    const { app, passwordResetTokenRepository } = buildApp({
      userRepository: { findByEmail: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }) },
    })

    const response = await postForgotPassword(app, 'known@beechcms.com', { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    await Promise.all(tasks)

    expect(response.status).toBe(200)
    const nowSeconds = FIXED_NOW_MS / 1000
    expect(passwordResetTokenRepository.invalidatePending).toHaveBeenCalledWith('u1', nowSeconds)
    expect(passwordResetTokenRepository.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', expiresAt: nowSeconds + 30 * 60 }))
  })

  it('mints the reset token with the injected id generator and stores only its hash', async () => {
    sendPasswordResetEmailMock.mockResolvedValue(undefined)
    const tasks: Promise<unknown>[] = []
    const { app, passwordResetTokenRepository } = buildApp({
      userRepository: { findByEmail: vi.fn().mockResolvedValue({ id: 'u1', isActive: true }) },
    })

    const response = await postForgotPassword(app, 'known@beechcms.com', { waitUntil: (task: Promise<unknown>) => tasks.push(task) })
    await Promise.all(tasks)

    expect(response.status).toBe(200)
    expect(passwordResetTokenRepository.create).toHaveBeenCalledWith(expect.objectContaining({ tokenHash: await sha256hex(FIXED_TOKEN) }))
    expect(sendPasswordResetEmailMock).toHaveBeenCalledWith(expect.objectContaining({ resetUrl: expect.stringContaining(`token=${FIXED_TOKEN}`) }))
  })
})
