/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi } from 'vitest'
import app from '../src/index'
import { AUTH_ERRORS } from '../src/auth/constants'
import bcrypt from 'bcryptjs'

const JWT_SECRET = 'test-secret-key'
const VALID_EMAIL = 'admin@beech.local'
const VALID_PASSWORD = 'password123'
const VALID_PASSWORD_HASH = bcrypt.hashSync(VALID_PASSWORD, 10)

/** Crea mock D1 che restituisce l'utente dato */
function createMockD1(user: { id: string; email: string; password_hash: string } | null) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(() => Promise.resolve(user)),
      })),
    })),
  }
}

/** Mock D1 che lancia eccezione (simula fallimento DB) */
function createFailingMockD1() {
  return {
    prepare: vi.fn(() => {
      throw new Error('D1 connection failed')
    }),
  }
}

describe('POST /auth/login', () => {
  describe('Happy Path (Successo - 200 OK)', () => {
    it('restituisce 200 e JWT token con email e password corrette', async () => {
      const mockDB = createMockD1({
        id: 'user-123',
        email: VALID_EMAIL,
        password_hash: VALID_PASSWORD_HASH,
      })

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(200)
      const data = await res.json() as { token?: string; expiresIn?: string }
      expect(data.token).toBeDefined()
      expect(typeof data.token).toBe('string')
      expect(data.token!.split('.')).toHaveLength(3) // JWT: header.payload.signature
      expect(data.expiresIn).toBe('2h')
    })
  })

  describe('Security Failures (401 Unauthorized)', () => {
    it('Case A: email corretta ma password errata - messaggio generico "Invalid credentials"', async () => {
      const mockDB = createMockD1({
        id: 'user-123',
        email: VALID_EMAIL,
        password_hash: VALID_PASSWORD_HASH,
      })

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL, password: 'wrongpassword' }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(401)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_CREDENTIALS)
    })

    it('Case B: utente non esistente nel DB - messaggio generico "Invalid credentials"', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'nonexistent@example.com', password: 'any' }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(401)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_CREDENTIALS)
    })
  })

  describe('Input Validation (400 Bad Request)', () => {
    it('Case A: body vuoto', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: '',
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(400)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_REQUEST)
    })

    it('Case B: manca il campo email', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password: VALID_PASSWORD }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(400)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_REQUEST)
    })

    it('Case C: manca il campo password', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(400)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_REQUEST)
    })

    it('Case D: email malformata (senza @)', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'ciao', password: VALID_PASSWORD }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(400)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_REQUEST)
    })
  })

  describe('System Resilience (500 Internal Server Error)', () => {
    it('simula fallimento DB - API restituisce 500 gestito senza crash', async () => {
      const mockDB = createFailingMockD1()

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(500)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.DATABASE_ERROR)
    })
  })
})
