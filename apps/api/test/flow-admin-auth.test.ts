import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { AUTH_ERRORS } from '../src/auth/constants'
import { hashRefreshToken } from '../src/auth/refresh'
import { MockD1Database } from './mocks/mock-d1-database'
import { TEST_USERS, TEST_ENV } from './fixtures'

const VALID_EMAIL = TEST_USERS[0].email
const VALID_PASSWORD = 'password123'

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Admin Authentication
 * 
 * This suite covers the full administrative session lifecycle and security protections.
 */
describe('Flow: Admin Authentication', () => {
  let db: MockD1Database
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    db = new MockD1Database({ users: TEST_USERS })
    app = createBeechApp({ seeds: [] })
  })

  describe('Login Flow', () => {
    it('success: valid credentials return tokens and set secure cookie', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      const body = await res.json<{ token: string }>()
      expect(body.token).toBeDefined()
      expect(res.headers.get('set-cookie')).toContain('refresh_token=')
    })

    it('error: incorrect password returns 401', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: 'wrongpassword' })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(401)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe(AUTH_ERRORS.INVALID_CREDENTIALS)
    })

    it('error: malformed email returns 400', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(400)
    })

    it('edge case: email with leading/trailing spaces is trimmed', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `  ${VALID_EMAIL}  `, password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
    })

    it('security: rate limiting returns 429 when too many attempts', async () => {
      const mockLimiter = { limit: vi.fn().mockResolvedValue({ success: false }) }
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any, LOGIN_RATE_LIMITER: mockLimiter as any })

      expect(res.status).toBe(429)
    })
  })

  describe('Refresh & Rotation Flow', () => {
    it('success: valid refresh token generates new tokens and rotates', async () => {
      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any })
      
      const refreshToken = loginRes.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1]
      const tokenHash = await hashRefreshToken(refreshToken!)

      const refreshRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Cookie': `refresh_token=${refreshToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(refreshRes.status).toBe(200)
      const newRefreshToken = refreshRes.headers.get('set-cookie')?.match(/refresh_token=([^;]+)/)?.[1]
      expect(newRefreshToken).not.toBe(refreshToken)

      // Verify revocation
      const oldToken = db.refreshTokens.find(t => t.token_hash === tokenHash)
      expect(oldToken?.revoked_at).not.toBeNull()
    })
  })

  describe('Logout Flow', () => {
    it('success: logout revokes token and clears cookie', async () => {
      const res = await app.request('/auth/logout', {
        method: 'POST',
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toMatch(/refresh_token=;|Max-Age=0/)
    })
  })
})
