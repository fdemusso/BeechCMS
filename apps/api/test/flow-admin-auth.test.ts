import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createBeechApp } from '../src/factory'
import { AUTH_ERRORS } from '../src/auth/constants'
import { hashRefreshToken } from '../src/auth/refresh'
import { MockD1Database } from './mocks/mock-d1-database'
import { TEST_USERS, TEST_ENV } from './fixtures'

/**
 * TEST CONFIGURATION
 * Constants used for authentication testing, referencing shared fixtures.
 */
const VALID_EMAIL = TEST_USERS[0].email
const VALID_PASSWORD = 'password123'

/**
 * SPRINT: BeechCMS Test Redesign
 * FLOW: Admin Authentication
 * 
 * This suite covers the full administrative session lifecycle:
 * 1. Login with credentials (receives Access Token and Refresh Cookie)
 * 2. Token Rotation (uses Cookie to obtain new tokens, invalidating previous ones)
 * 3. Logout (permanent session revocation)
 */
describe('Flow: Admin Authentication', () => {
  let db: MockD1Database
  let app: ReturnType<typeof createBeechApp>

  beforeEach(() => {
    // Initialize mock database with shared test users
    db = new MockD1Database({ users: TEST_USERS })
    // Create app without content seeds to isolate authentication logic
    app = createBeechApp({ seeds: [] })
  })

  /**
   * TEST: LOGIN
   * Verifies the system recognizes valid credentials and initiates a session.
   */
  describe('Login Flow', () => {
    it('success: valid credentials return tokens and set secure cookie', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      const body = await res.json<{ token: string; expiresIn: string }>()
      
      // Access token must be present in JSON response
      expect(body.token).toBeDefined()
      
      // Refresh token must be stored in an HttpOnly cookie for security (CSRF protection)
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toContain('refresh_token=')
      expect(setCookie).toContain('HttpOnly')
      
      // Verify persistence in the mock database
      expect(db.refreshTokens.length).toBe(1)
      expect(db.refreshTokens[0].user_id).toBe(TEST_USERS[0].id)
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

    it('error: nonexistent email returns 401', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'ghost@beechcms.io', password: 'longenoughpassword' })
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(401)
    })

    it('error: malformed input returns 400', async () => {
      const res = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'invalid-email-format' }) // missing password
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(400)
    })
  })

  /**
   * TEST: REFRESH & ROTATION
   * Implements Refresh Token Rotation for maximum security.
   * Every time a Refresh Token is used, it is revoked and a new one is issued.
   */
  describe('Refresh & Rotation Flow', () => {
    it('success: valid refresh token generates new tokens and rotates', async () => {
      // 1. Login to obtain initial tokens
      const loginRes = await app.request('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD })
      }, { ...TEST_ENV, DB: db as any })
      
      const cookies = loginRes.headers.get('set-cookie')
      const refreshToken = cookies?.match(/refresh_token=([^;]+)/)?.[1]
      expect(refreshToken).toBeDefined()
      const tokenHash = await hashRefreshToken(refreshToken!)

      // 2. Request new access token using the refresh cookie
      const refreshRes = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Cookie': `refresh_token=${refreshToken}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(refreshRes.status).toBe(200)
      const refreshBody = await refreshRes.json<{ token: string }>()
      expect(refreshBody.token).toBeDefined()

      // 3. Verify rotation (system must issue a NEW refresh token)
      const newCookies = refreshRes.headers.get('set-cookie')
      const newRefreshToken = newCookies?.match(/refresh_token=([^;]+)/)?.[1]
      expect(newRefreshToken).toBeDefined()
      expect(newRefreshToken).not.toBe(refreshToken)

      // 4. SECURITY: Old token must be marked as "revoked" in DB to prevent replay attacks
      const oldTokenRecord = db.refreshTokens.find(t => t.token_hash === tokenHash)
      expect(oldTokenRecord?.revoked_at).not.toBeNull()
      
      // 5. New token must be active and ready for use
      const newTokenHash = await hashRefreshToken(newRefreshToken!)
      const newTokenRecord = db.refreshTokens.find(t => t.token_hash === newTokenHash)
      expect(newTokenRecord).toBeDefined()
      expect(newTokenRecord?.revoked_at).toBeNull()
    })

    it('error: reused (revoked) refresh token returns 401', async () => {
      const token = 'already-used-token'
      const tokenHash = await hashRefreshToken(token)
      
      // Simulate an already consumed token in the DB
      db.refreshTokens.push({ 
        id: 'old-session-id',
        token_hash: tokenHash, 
        user_id: TEST_USERS[0].id, 
        expires_at: Math.floor(Date.now() / 1000) + 3600, 
        revoked_at: 1714752000 
      })

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { 'Cookie': `refresh_token=${token}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(401)
      const body = await res.json<{ error: string }>()
      expect(body.error).toBe('Invalid refresh token')
    })
  })

  /**
   * TEST: LOGOUT
   * Verifies the session is correctly terminated on both client and server.
   */
  describe('Logout Flow', () => {
    it('success: logout revokes token and clears cookie', async () => {
      const token = 'active-session-token'
      const tokenHash = await hashRefreshToken(token)

      // Insert an active token into DB
      db.refreshTokens.push({ 
        id: 'active-session-id',
        token_hash: tokenHash, 
        user_id: TEST_USERS[0].id, 
        expires_at: Math.floor(Date.now() / 1000) + 3600, 
        revoked_at: null 
      })

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { 'Cookie': `refresh_token=${token}` }
      }, { ...TEST_ENV, DB: db as any })

      expect(res.status).toBe(200)
      
      // Token in DB must be revoked immediately
      const tokenRecord = db.refreshTokens.find(t => t.token_hash === tokenHash)
      expect(tokenRecord?.revoked_at).not.toBeNull()

      // Browser must be instructed to clear the cookie
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toMatch(/refresh_token=;|Max-Age=0/)
    })
  })
})
