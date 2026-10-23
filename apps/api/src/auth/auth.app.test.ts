// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { IClock, IIdGenerator, ISessionRepository, ITokenService, IUserRepository, UserRecord } from '@beechcms/core'
import { sha256hex } from '@beechcms/core'
import { authApp } from './auth.app'
import { InMemoryHashProvider } from './__fixtures__/in-memory-hash-provider'
import type { Env, Variables } from '../types'

const INJECTED_NOW_SECONDS = 1000
const INJECTED_ID = 'injected-id'
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60
const REFRESH_COOKIE = 'refresh_token=opaque-refresh-token'

const user = {
  id: 'user-1',
  email: 'admin@beech.test',
  name: 'Ada',
  surname: 'Admin',
  passwordHash: 'HASH:password123',
  role: 'admin',
  isActive: true,
} as UserRecord

describe('authApp', () => {
  const clock: IClock = { now: () => INJECTED_NOW_SECONDS * 1000, nowSeconds: () => INJECTED_NOW_SECONDS }
  const idGenerator: IIdGenerator = { uuid: vi.fn(() => INJECTED_ID) }
  const sessionRepository = {
    saveRefreshToken: vi.fn(async () => {}),
    findActiveByHash: vi.fn(async () => ({ id: 's', userId: user.id, tokenHash: 'h', expiresAt: 0, createdAt: 0, revokedAt: null })),
    revokeByHash: vi.fn(async () => true),
  }

  const limiter = { checkLimit: vi.fn(async () => ({ isAllowed: true, retryAfterSeconds: undefined as number | undefined })) }
  const userRepository = { findByEmail: vi.fn(async () => user as UserRecord | null), findById: vi.fn(async () => user as UserRecord | null) }

  function buildApp() {
    const app = new Hono<{ Bindings: Env; Variables: Variables }>()
    app.use('*', async (c, next) => {
      const allowAll = { getLimiter: () => limiter }
      c.set('rateLimiters', allowAll as unknown as Variables['rateLimiters'])
      c.set('userRepository', userRepository as unknown as IUserRepository)
      c.set('sessionRepository', sessionRepository as unknown as ISessionRepository)
      c.set('tokenService', { issue: async () => 'access-token' } as unknown as ITokenService)
      c.set('hashProvider', new InMemoryHashProvider())
      c.set('clock', clock)
      c.set('idGenerator', idGenerator)
      await next()
    })
    app.route('/', authApp)
    return app
  }

  beforeEach(() => {
    vi.clearAllMocks()
    limiter.checkLimit.mockResolvedValue({ isAllowed: true, retryAfterSeconds: undefined })
    userRepository.findByEmail.mockResolvedValue(user)
    userRepository.findById.mockResolvedValue(user)
    sessionRepository.revokeByHash.mockResolvedValue(true)
  })

  const login = (app: ReturnType<typeof buildApp>, body: unknown) =>
    app.request('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const refresh = (app: ReturnType<typeof buildApp>) =>
    app.request('/auth/refresh', { method: 'POST', headers: { Cookie: REFRESH_COOKIE } })

  describe('POST /auth/login', () => {
    it('stamps the session id and expiry from the injected idGenerator and clock', async () => {
      const app = buildApp()

      const response = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, password: 'password123' }),
      })

      expect(response.status).toBe(200)
      expect(sessionRepository.saveRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: INJECTED_ID, expiresAt: INJECTED_NOW_SECONDS + REFRESH_TTL_SECONDS }),
      )
    })
  })

  describe('POST /auth/login rejections', () => {
    it('answers 400 for a malformed body', async () => {
      const response = await login(buildApp(), { email: 42 })

      expect(response.status).toBe(400)
      expect(sessionRepository.saveRefreshToken).not.toHaveBeenCalled()
    })

    it('answers 429 for a malformed body from a rate-limited client', async () => {
      limiter.checkLimit.mockResolvedValue({ isAllowed: false, retryAfterSeconds: undefined })

      const response = await login(buildApp(), { email: 42 })

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBeNull()
    })

    it('hides error details in production when persisting the session fails', async () => {
      sessionRepository.saveRefreshToken.mockRejectedValueOnce(new Error('d1 down'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await buildApp().request(
        '/auth/login',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'password123' }) },
        { ENV: 'production' },
      )

      expect(response.status).toBe(500)
      expect(consoleError).not.toHaveBeenCalled()
    })

    it('answers 429 with Retry-After when rate limited', async () => {
      limiter.checkLimit.mockResolvedValue({ isAllowed: false, retryAfterSeconds: 30 })

      const response = await login(buildApp(), { email: user.email, password: 'password123' })

      expect(response.status).toBe(429)
      expect(response.headers.get('Retry-After')).toBe('30')
    })

    it('answers 401 for a wrong password', async () => {
      const response = await login(buildApp(), { email: user.email, password: 'wrong-password' })

      expect(response.status).toBe(401)
      expect(sessionRepository.saveRefreshToken).not.toHaveBeenCalled()
    })

    it('answers 500 when persisting the session fails', async () => {
      sessionRepository.saveRefreshToken.mockRejectedValueOnce(new Error('d1 down'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await login(buildApp(), { email: user.email, password: 'password123' })

      expect(response.status).toBe(500)
    })
  })

  describe('POST /auth/refresh', () => {
    it('looks up, rotates and revokes sessions at the injected clock time', async () => {
      const app = buildApp()

      const response = await app.request('/auth/refresh', { method: 'POST', headers: { Cookie: REFRESH_COOKIE } })

      expect(response.status).toBe(200)
      const oldHash = await sha256hex('opaque-refresh-token')
      expect(sessionRepository.findActiveByHash).toHaveBeenCalledWith(oldHash, INJECTED_NOW_SECONDS)
      expect(sessionRepository.saveRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: INJECTED_ID, expiresAt: INJECTED_NOW_SECONDS + REFRESH_TTL_SECONDS }),
      )
      expect(sessionRepository.revokeByHash).toHaveBeenCalledWith(oldHash, INJECTED_NOW_SECONDS)
    })
  })

  describe('POST /auth/refresh rejections', () => {
    it('answers 429 when the refresh limiter rejects the client', async () => {
      limiter.checkLimit.mockResolvedValue({ isAllowed: false, retryAfterSeconds: 5 })

      const response = await refresh(buildApp())

      expect(response.status).toBe(429)
      expect(sessionRepository.findActiveByHash).not.toHaveBeenCalled()
    })

    it('answers 401 without a refresh cookie', async () => {
      const response = await buildApp().request('/auth/refresh', { method: 'POST' })

      expect(response.status).toBe(401)
    })

    it('answers 401 when no active session matches', async () => {
      sessionRepository.findActiveByHash.mockResolvedValueOnce(null as never)

      const response = await refresh(buildApp())

      expect(response.status).toBe(401)
      expect(sessionRepository.saveRefreshToken).not.toHaveBeenCalled()
    })

    it('revokes the session at the injected time when the user is gone', async () => {
      userRepository.findById.mockResolvedValueOnce(null)

      const response = await refresh(buildApp())

      expect(response.status).toBe(401)
      expect(sessionRepository.revokeByHash).toHaveBeenCalledWith(await sha256hex('opaque-refresh-token'), INJECTED_NOW_SECONDS)
    })

    it('revokes the session at the injected time when the user is deactivated', async () => {
      userRepository.findById.mockResolvedValueOnce({ ...user, isActive: false })

      const response = await refresh(buildApp())

      expect(response.status).toBe(401)
      expect(sessionRepository.revokeByHash).toHaveBeenCalledWith(await sha256hex('opaque-refresh-token'), INJECTED_NOW_SECONDS)
    })

    it('rolls back the new session when the old one was already revoked', async () => {
      sessionRepository.revokeByHash.mockResolvedValueOnce(false)

      const response = await refresh(buildApp())

      expect(response.status).toBe(401)
      expect(sessionRepository.revokeByHash).toHaveBeenCalledTimes(2)
    })

    it('rolls back the new session and answers 500 when revoking throws', async () => {
      sessionRepository.revokeByHash.mockRejectedValueOnce(new Error('d1 down'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await refresh(buildApp())

      expect(response.status).toBe(500)
      expect(sessionRepository.revokeByHash).toHaveBeenCalledTimes(2)
    })
  })

  describe('POST /auth/logout', () => {
    it('revokes the session at the injected clock time', async () => {
      const app = buildApp()

      const response = await app.request('/auth/logout', { method: 'POST', headers: { Cookie: REFRESH_COOKIE } })

      expect(response.status).toBe(200)
      expect(sessionRepository.revokeByHash).toHaveBeenCalledWith(await sha256hex('opaque-refresh-token'), INJECTED_NOW_SECONDS)
    })

    it('answers 200 without touching the repository when no cookie is sent', async () => {
      const response = await buildApp().request('/auth/logout', { method: 'POST' })

      expect(response.status).toBe(200)
      expect(sessionRepository.revokeByHash).not.toHaveBeenCalled()
    })

    it('answers 500 when revoking throws', async () => {
      sessionRepository.revokeByHash.mockRejectedValueOnce(new Error('d1 down'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      const response = await buildApp().request('/auth/logout', { method: 'POST', headers: { Cookie: REFRESH_COOKIE } })

      expect(response.status).toBe(500)
    })
  })
})
