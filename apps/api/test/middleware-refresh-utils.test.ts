/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockJwtVerify = vi.hoisted(() => vi.fn())
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>()
  return {
    ...actual,
    jwtVerify: mockJwtVerify,
  }
})

import app from "../src/index"
import {
  hashRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  saveRefreshToken,
} from "../src/auth/refresh"

const JWT_SECRET = "test-secret-key"

function createMockD1ForAuthRoute() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      })),
    })),
  }
}

describe("auth middleware - hardening", () => {
  beforeEach(() => {
    mockJwtVerify.mockReset()
  })

  it("token con protectedHeader.typ non JWT -> 401 Unauthorized", async () => {
    mockJwtVerify.mockResolvedValue({
      payload: { sub: "user-1", email: "test@beech.local" },
      protectedHeader: { alg: "HS256", typ: "NOT_JWT" },
    } as never)

    const mockDB = createMockD1ForAuthRoute()
    const res = await app.request(
      "/api/content/articoli",
      {
        method: "GET",
        headers: { Authorization: "Bearer valid-token" },
      },
      { DB: mockDB, JWT_SECRET }
    )

    expect(res.status).toBe(401)
    const data: { error?: string } = await res.json()
    expect(data.error).toBe("Unauthorized")
    expect(mockJwtVerify).toHaveBeenCalled()
  })
})

describe("auth/refresh utilities", () => {
  it("hashRefreshToken: stesso input => hash deterministico hex sha256", async () => {
    const token = "refresh-token-123"
    const h1 = await hashRefreshToken(token)
    const h2 = await hashRefreshToken(token)
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[a-f0-9]{64}$/)
  })

  it("validateRefreshToken: token non trovato / revocato / scaduto / valido", async () => {
    const notFoundDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue(null),
        })),
      })),
    }
    expect(await validateRefreshToken(notFoundDb as any, "t1")).toEqual({ valid: false })

    const revokedDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            user_id: "u1",
            expires_at: Math.floor(Date.now() / 1000) + 1000,
            revoked_at: Math.floor(Date.now() / 1000),
          }),
        })),
      })),
    }
    expect(await validateRefreshToken(revokedDb as any, "t2")).toEqual({ valid: false })

    const expiredDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            user_id: "u1",
            expires_at: Math.floor(Date.now() / 1000) - 10,
            revoked_at: null,
          }),
        })),
      })),
    }
    expect(await validateRefreshToken(expiredDb as any, "t3")).toEqual({ valid: false })

    const validDb = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          first: vi.fn().mockResolvedValue({
            user_id: "u-ok",
            expires_at: Math.floor(Date.now() / 1000) + 1000,
            revoked_at: null,
          }),
        })),
      })),
    }
    expect(await validateRefreshToken(validDb as any, "t4")).toEqual({
      valid: true,
      userId: "u-ok",
    })
  })

  it("revokeRefreshToken: true se changes > 0, false altrimenti", async () => {
    const dbOk = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        })),
      })),
    }
    expect(await revokeRefreshToken(dbOk as any, "tok-ok")).toBe(true)

    const dbNoChanges = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ meta: { changes: 0 } }),
        })),
      })),
    }
    expect(await revokeRefreshToken(dbNoChanges as any, "tok-no")).toBe(false)
  })

  it("saveRefreshToken: inserisce record con hash e scadenza", async () => {
    const runMock = vi.fn().mockResolvedValue({ success: true })
    const bindMock = vi.fn(() => ({ run: runMock }))
    const db = {
      prepare: vi.fn(() => ({ bind: bindMock })),
    }

    await saveRefreshToken(db as any, "user-1", "tok-1", 7)

    expect(db.prepare).toHaveBeenCalled()
    expect(bindMock).toHaveBeenCalled()
    const args = bindMock.mock.calls[0]
    expect(args).toHaveLength(4)
    expect(args[1]).toBe("user-1")
    expect(String(args[2])).toMatch(/^[a-f0-9]{64}$/)
    expect(typeof args[3]).toBe("number")
    expect(runMock).toHaveBeenCalled()
  })
})

