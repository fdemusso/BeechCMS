// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * Order of the checks on the password-reset routes: mail transport, then the limiter, then the
 * body. Unit tier: the repositories and limiters are fakes so each refusal can be told apart.
 */

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { passwordResetApp } from './index'

vi.mock('../../shared/email', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordChangedEmail: vi.fn().mockResolvedValue(undefined),
  resolveEmailLocale: () => 'en',
}))

const WITH_MAIL = { RESEND_API_KEY: 'test-key', ENV: 'test' }
const WITHOUT_MAIL = { ENV: 'test' }

function buildApp(limiter: { isAllowed: boolean; retryAfterSeconds?: number } = { isAllowed: true }) {
  const checkLimit = vi.fn().mockResolvedValue(limiter)
  const userRepository = { findByEmail: vi.fn().mockResolvedValue(null) }
  const passwordResetTokenRepository = { findValidByHashWithEmail: vi.fn().mockResolvedValue(null) }
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('userRepository' as never, userRepository)
    c.set('passwordResetTokenRepository' as never, passwordResetTokenRepository)
    c.set('rateLimiters' as never, { getLimiter: () => ({ checkLimit }) })
    await next()
  })
  app.route('/', passwordResetApp)
  return { app, checkLimit, userRepository, passwordResetTokenRepository }
}

function post(app: Hono, path: string, body: string, env: object) {
  return app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }, env)
}

describe('GET /auth/features', () => {
  it.each([
    ['a mail transport is configured', WITH_MAIL, true],
    ['there is no mail transport', WITHOUT_MAIL, false],
  ])('reports passwordReset for the dashboard when %s', async (_label, env, expected) => {
    const { app } = buildApp()

    const response = await app.request('/auth/features', {}, env)

    expect(response.status).toBe(200)
    expect(await response.json<{ passwordReset: boolean }>()).toEqual({ passwordReset: expected })
  })
})

describe('POST /auth/forgot-password', () => {
  it('without a mail transport answers 503 before the body is read and charges no limiter', async () => {
    const { app, checkLimit } = buildApp()

    const response = await post(app, '/auth/forgot-password', '{not json', WITHOUT_MAIL)

    expect(response.status).toBe(503)
    expect(checkLimit).not.toHaveBeenCalled()
  })

  it.each([['{not json'], ['null'], ['[]'], ['"text"']])(
    'the body %s is refused with 400 and charges the IP limiter',
    async (body) => {
      const { app, checkLimit, userRepository } = buildApp()

      const response = await post(app, '/auth/forgot-password', body, WITH_MAIL)

      expect(response.status).toBe(400)
      expect(await response.json<{ error: string }>()).toEqual({ error: 'Invalid request body' })
      expect(checkLimit).toHaveBeenCalledTimes(1)
      expect(userRepository.findByEmail).not.toHaveBeenCalled()
    },
  )
})

describe('POST /auth/reset-password', () => {
  it('without a mail transport answers 503 before the limiter and the body', async () => {
    const { app, checkLimit } = buildApp()

    const response = await post(app, '/auth/reset-password', '{not json', WITHOUT_MAIL)

    expect(response.status).toBe(503)
    expect(checkLimit).not.toHaveBeenCalled()
  })

  it('an exhausted limiter answers 429 with Retry-After before the body is read', async () => {
    const { app, passwordResetTokenRepository } = buildApp({ isAllowed: false, retryAfterSeconds: 42 })

    const response = await post(app, '/auth/reset-password', '{not json', WITH_MAIL)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
    expect(passwordResetTokenRepository.findValidByHashWithEmail).not.toHaveBeenCalled()
  })

  it.each([['{not json'], ['null'], ['[]'], ['"text"']])(
    'the body %s is refused with 400 and looks up no token',
    async (body) => {
      const { app, passwordResetTokenRepository } = buildApp()

      const response = await post(app, '/auth/reset-password', body, WITH_MAIL)

      expect(response.status).toBe(400)
      expect(await response.json<{ error: string }>()).toEqual({ error: 'Invalid request body' })
      expect(passwordResetTokenRepository.findValidByHashWithEmail).not.toHaveBeenCalled()
    },
  )
})
