/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Seed } from '@beech/core'

// --- Mock jose (auth bypass) ---
const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>()
  return { ...actual, jwtVerify: mockJwtVerify }
})

// --- Test seed with a privacy:hash field ---
const HASH_SEED: Seed = {
  slug: 'test-members',
  label: 'Member',
  displayNameAlias: 'name',
  branches: [
    { id: 'br_01', alias: 'name', label: 'Name', type: 'text', requiredOnCreate: true },
    {
      id: 'br_02',
      alias: 'password',
      label: 'Password',
      type: 'text',
      policies: { privacy: 'hash' },
    },
  ],
}

// Override getSeed for the test slug only
vi.mock('@beech/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@beech/core')>()
  return {
    ...actual,
    getSeed: (slug: string) => (slug === 'test-members' ? HASH_SEED : actual.getSeed(slug)),
  }
})

import app from '../../index'

// --- Helpers ---

async function sha256hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function makeAuthHeader() {
  return { Authorization: 'Bearer test-token' }
}

function makeEntry(id: string, dbData: Record<string, unknown>) {
  return {
    id,
    schema_slug: 'test-members',
    slug: 'member-1',
    status: 'published',
    data: JSON.stringify(dbData),
    created_at: 1000000,
    updated_at: 1000000,
  }
}

function makeMockDB(row: object | null, updateCapture?: { called: boolean }) {
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        first: vi.fn(() => Promise.resolve(row)),
        run: vi.fn(() => {
          if (updateCapture && sql.includes('UPDATE')) updateCapture.called = true
          return Promise.resolve({ success: true, meta: { changes: 1 } })
        }),
        all: vi.fn(() => Promise.resolve({ results: row ? [row] : [] })),
      })),
      first: vi.fn(() => Promise.resolve(row)),
      run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
    })),
  }
}

const ENTRY_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const CURRENT_PLAINTEXT = 'old-secret'
const NEXT_PLAINTEXT = 'new-secret'

// --- Tests ---

describe('POST /:slug/:id/rotate-field', () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
    mockJwtVerify.mockResolvedValue({
      payload: { sub: 'user-1', email: 'admin@beech.local' },
      protectedHeader: { alg: 'HS256', typ: 'JWT' },
    })
  })

  it('returns 200 and updates the field when current matches', async () => {
    const storedHash = await sha256hex(CURRENT_PLAINTEXT)
    const updateCapture = { called: false }
    const mockDB = makeMockDB(makeEntry(ENTRY_ID, { br_02: storedHash }), updateCapture)

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(200)
    const json = await res.json<{ success: boolean }>()
    expect(json.success).toBe(true)
    expect(updateCapture.called).toBe(true)
  })

  it('returns 403 when current does not match stored hash', async () => {
    const storedHash = await sha256hex(CURRENT_PLAINTEXT)
    const mockDB = makeMockDB(makeEntry(ENTRY_ID, { br_02: storedHash }))

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password', current: 'wrong-value', next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(403)
  })

  it('returns 404 when entry does not exist', async () => {
    const mockDB = makeMockDB(null)

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(404)
  })

  it('returns 404 when seed does not exist', async () => {
    const mockDB = makeMockDB(null)

    const res = await app.request(
      `/api/content/unknown-seed/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(404)
  })

  it('returns 400 when field does not exist in the seed', async () => {
    const storedHash = await sha256hex(CURRENT_PLAINTEXT)
    const mockDB = makeMockDB(makeEntry(ENTRY_ID, { br_02: storedHash }))

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'nonexistent', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(400)
  })

  it('returns 422 when field does not use hash privacy', async () => {
    const mockDB = makeMockDB(makeEntry(ENTRY_ID, { br_01: 'Alice' }))

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'name', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(422)
  })

  it('returns 422 when the field has no stored value', async () => {
    // Entry exists but br_02 is not in data
    const mockDB = makeMockDB(makeEntry(ENTRY_ID, { br_01: 'Alice' }))

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(422)
  })

  it('returns 400 when body is missing required fields', async () => {
    const mockDB = makeMockDB(null)

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password' }), // missing current and next
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(400)
  })

  it('returns 401 when not authenticated', async () => {
    mockJwtVerify.mockRejectedValueOnce(new Error('invalid token'))
    const mockDB = makeMockDB(null)

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'password', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(401)
  })

  it('stores a new SHA-256 hash (not the plaintext) after rotation', async () => {
    const storedHash = await sha256hex(CURRENT_PLAINTEXT)
    const bindCalls: Array<{ sql: string; args: unknown[] }> = []

    const mockDB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((...args: unknown[]) => {
          bindCalls.push({ sql, args })
          return {
            first: vi.fn(() => Promise.resolve(makeEntry(ENTRY_ID, { br_02: storedHash }))),
            run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
            all: vi.fn(() => Promise.resolve({ results: [] })),
          }
        }),
        first: vi.fn(() => Promise.resolve(makeEntry(ENTRY_ID, { br_02: storedHash }))),
        run: vi.fn(() => Promise.resolve({ success: true, meta: { changes: 1 } })),
      })),
    }

    const res = await app.request(
      `/api/content/test-members/${ENTRY_ID}/rotate-field`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...makeAuthHeader() },
        body: JSON.stringify({ field: 'password', current: CURRENT_PLAINTEXT, next: NEXT_PLAINTEXT }),
      },
      { JWT_SECRET: 'test-secret', DB: mockDB }
    )

    expect(res.status).toBe(200)
    const updateCall = bindCalls.find((c) => c.sql.includes('UPDATE content_entries SET data'))
    expect(updateCall).toBeDefined()
    const saved = JSON.parse(updateCall!.args[0] as string)
    // The stored value must be a SHA-256 hex string, not the plaintext
    expect(saved.br_02).not.toBe(NEXT_PLAINTEXT)
    expect(saved.br_02).toMatch(/^[0-9a-f]{64}$/)
    expect(saved.br_02).toBe(await sha256hex(NEXT_PLAINTEXT))
  })
})
