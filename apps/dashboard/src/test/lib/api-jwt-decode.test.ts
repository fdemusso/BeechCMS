// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from "vitest"
import { decodeJwtPayload, isTokenValid } from "@/lib/api"

function base64url(json: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(json))
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("")
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function fakeJwt(payload: unknown): string {
  return `${base64url({ alg: "none" })}.${base64url(payload)}.sig`
}

describe("decodeJwtPayload", () => {
  it("decodes a payload whose base64url form contains '-' (unicode name)", () => {
    // Verified: JSON.stringify + base64 of this payload contains standard-base64
    // '+' (translated to base64url '-'), which raw atob() cannot parse.
    const payload = { email: "a@b.co", name: "🌾n62é", role: "admin" }
    const token = fakeJwt(payload)
    expect(base64url(payload)).toMatch(/-/)
    expect(decodeJwtPayload(token)).toEqual(payload)
  })

  it("throws with raw atob() but decodeJwtPayload succeeds (regression guard)", () => {
    const payload = { email: "a@b.co", name: "🌾n62é", role: "admin" }
    const token = fakeJwt(payload)
    const raw = token.split(".")[1]
    expect(() => atob(raw)).toThrow()
    expect(() => decodeJwtPayload(token)).not.toThrow()
  })

  it("decodes a plain-ascii payload unchanged", () => {
    const payload = { email: "a@b.co", exp: 123 }
    expect(decodeJwtPayload(fakeJwt(payload))).toEqual(payload)
  })
})

describe("isTokenValid", () => {
  it("returns false for null token", () => {
    expect(isTokenValid(null)).toBe(false)
  })

  it("returns true for a non-expired base64url-heavy payload", () => {
    const token = fakeJwt({ email: "x@y.co", name: "🌾n62é", exp: Date.now() / 1000 + 3600 })
    expect(isTokenValid(token)).toBe(true)
  })

  it("returns false for an expired token", () => {
    const token = fakeJwt({ email: "x@y.co", exp: Date.now() / 1000 - 3600 })
    expect(isTokenValid(token)).toBe(false)
  })

  it("returns false (not throw) for a malformed token", () => {
    expect(isTokenValid("not-a-jwt")).toBe(false)
  })
})
