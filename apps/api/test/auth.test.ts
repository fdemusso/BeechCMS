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
        run: vi.fn(() => Promise.resolve({ success: true, meta: {} })),
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

describe('GET / (root)', () => {
  it('restituisce 200 e messaggio di stato', async () => {
    const res = await app.request('/', {
      method: 'GET',
    }, { DB: createMockD1(null), JWT_SECRET })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Beech API is running!')
  })
})

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
      expect(data.expiresIn).toBe('15m') // Aggiornato da '2h' a '15m' per access token con refresh
    })
  })

  describe('Rate Limiting (429 Too Many Requests)', () => {
    it('restituisce 429 quando rate limit superato', async () => {
      const mockDB = createMockD1(null)
      const mockLoginLimiter = {
        limit: vi.fn(() => Promise.resolve({ success: false })),
      }

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL, password: VALID_PASSWORD }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET, LOGIN_RATE_LIMITER: mockLoginLimiter })

      expect(res.status).toBe(429)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.RATE_LIMIT_EXCEEDED)
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
        body: JSON.stringify({ email: 'nonexistent@example.com', password: 'anypassword' }),
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

    it('Case E: password troppo corta (meno di 8 caratteri)', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL, password: 'short' }),
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
      expect(data.error).toBe(AUTH_ERRORS.GENERIC_ERROR)
    })
  })

  describe('Ulteriori validazioni input', () => {
    it('Case F: password troppo lunga (> 128 caratteri) -> 400', async () => {
      const mockDB = createMockD1(null)
      const longPassword = 'a'.repeat(129)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: VALID_EMAIL, password: longPassword }),
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(400)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_REQUEST)
    })

    it('Case G: body JSON malformato -> 400', async () => {
      const mockDB = createMockD1(null)

      const res = await app.request('/auth/login', {
        method: 'POST',
        body: '{"email":"test@test.com","password":"password123"',
        headers: { 'Content-Type': 'application/json' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(400)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.INVALID_REQUEST)
    })
  })

  describe('Login successo - cookie', () => {
    it('restituisce Set-Cookie per refresh_token su login riuscito', async () => {
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
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toBeDefined()
      expect(setCookie).toContain('refresh_token=')
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('Path=/auth')
    })
  })
})

/** Mock D1 per refresh: restituisce risultati in sequenza per first() e run() */
function createMockD1ForRefresh(overrides?: {
  validateResult?: { user_id: string; expires_at: number; revoked_at: number | null } | null
  userResult?: { id: string; email: string } | null
  shouldFail?: boolean
}) {
  const opts = {
    validateResult: { user_id: 'user-123', expires_at: Math.floor(Date.now() / 1000) + 86400, revoked_at: null },
    userResult: { id: 'user-123', email: 'test@beech.local' },
    shouldFail: false,
    ...overrides,
  }
  let callIndex = 0
  const firstResults = [opts.validateResult, opts.userResult]
  const firstMock = vi.fn(() => {
    const result = firstResults[callIndex++] ?? null
    return Promise.resolve(result)
  })
  const runMock = vi.fn(() => Promise.resolve({ success: true, meta: {} }))
  const bindMock = vi.fn(() => ({ first: firstMock, run: runMock }))
  const prepareMock = vi.fn(() => {
    if (opts.shouldFail) throw new Error('D1 connection failed')
    return { bind: bindMock }
  })
  return {
    prepare: prepareMock,
    _firstMock: firstMock,
    _runMock: runMock,
  }
}

describe('POST /auth/refresh', () => {
  describe('Happy Path (200 OK)', () => {
    it('restituisce 200 e nuovo access token con cookie refresh valido', async () => {
      const mockDB = createMockD1ForRefresh()

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=valid-uuid-token-12345' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(200)
      const data = await res.json() as { token?: string; expiresIn?: string }
      expect(data.token).toBeDefined()
      expect(data.token!.split('.')).toHaveLength(3)
      expect(data.expiresIn).toBe('15m')
      expect(res.headers.get('set-cookie')).toContain('refresh_token=')
    })
  })

  describe('Errori (401 Unauthorized)', () => {
    it('cookie refresh_token mancante -> 401', async () => {
      const mockDB = createMockD1ForRefresh()

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: {},
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(401)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe('Refresh token missing')
    })

    it('refresh token invalido o revocato -> 401', async () => {
      const mockDB = createMockD1ForRefresh({ validateResult: null })

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=invalid-token' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(401)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe('Invalid refresh token')
    })

    it('utente non trovato dopo validazione token -> 401', async () => {
      const mockDB = createMockD1ForRefresh({ userResult: null })

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=valid-token' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(401)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe('User not found')
    })
  })

  describe('Rate Limiting (429)', () => {
    it('restituisce 429 quando rate limit superato', async () => {
      const mockDB = createMockD1ForRefresh()
      const mockRefreshLimiter = { limit: vi.fn(() => Promise.resolve({ success: false })) }

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=valid-token' },
      }, { DB: mockDB, JWT_SECRET, REFRESH_RATE_LIMITER: mockRefreshLimiter })

      expect(res.status).toBe(429)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.RATE_LIMIT_EXCEEDED)
    })
  })

  describe('System Resilience (500)', () => {
    it('fallimento DB -> 500 con messaggio generico', async () => {
      const mockDB = createMockD1ForRefresh({ shouldFail: true })

      const res = await app.request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=valid-token' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(500)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.GENERIC_ERROR)
    })
  })
})

describe('POST /auth/logout', () => {
  describe('Happy Path (200 OK)', () => {
    it('restituisce 200 e cancella cookie anche senza cookie inviato', async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true, meta: {} })
      const mockDB = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: runMock })),
        })),
      }

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: {},
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(200)
      const data = await res.json() as { message?: string }
      expect(data.message).toBe('Logged out')
      const setCookie = res.headers.get('set-cookie')
      expect(setCookie).toBeDefined()
      expect(setCookie).toMatch(/refresh_token=;|Max-Age=0/)
    })

    it('restituisce 200 e revoca token quando cookie presente', async () => {
      const runMock = vi.fn().mockResolvedValue({ success: true, meta: {} })
      const bindMock = vi.fn(() => ({ run: runMock }))
      const mockDB = {
        prepare: vi.fn(() => ({ bind: bindMock })),
      }

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=some-token-to-revoke' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(200)
      expect(runMock).toHaveBeenCalled()
    })
  })

  describe('System Resilience (500)', () => {
    it('fallimento DB durante revoca -> 500', async () => {
      const mockDB = {
        prepare: vi.fn(() => {
          throw new Error('D1 connection failed')
        }),
      }

      const res = await app.request('/auth/logout', {
        method: 'POST',
        headers: { Cookie: 'refresh_token=valid-token' },
      }, { DB: mockDB, JWT_SECRET })

      expect(res.status).toBe(500)
      const data = await res.json() as { error?: string }
      expect(data.error).toBe(AUTH_ERRORS.GENERIC_ERROR)
    })
  })
})
