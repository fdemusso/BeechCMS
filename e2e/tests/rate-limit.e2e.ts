// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — rate limiting enforcement across the live API worker.
 *
 * Demonstrates the defect classes identified in issues #453 and #454:
 * 1. Issue #453: rateLimiterMiddleware instantiates a brand new TokenBucketRateLimiter
 *    registry on every HTTP request, resetting bucket capacities so that sequential requests
 *    never decrement remaining tokens across requests or trigger 429 Too Many Requests.
 * 2. Issue #454: Cloudflare rate limiting bindings declared in wrangler.jsonc (LOGIN_RATE_LIMITER,
 *    FORGOT_PASSWORD_RATE_LIMITER, etc.) are never consumed by buildDefaultRegistry at runtime,
 *    leaving binding-based rate limiting and fail-closed security orphaned.
 */

import { expect, test } from '@playwright/test'
import { API_PORT } from '../playwright.config'

const API = `http://127.0.0.1:${API_PORT}`

test.describe('rate limiting enforcement', () => {
  test('consecutive requests to /auth/login exceed capacity and receive 429 too_many_requests', async ({ request }) => {
    // 1. ARRANGE
    const payload = {
      email: 'attacker-target@example.com',
      password: 'invalid-password-attempt',
    }
    const statuses: number[] = []

    // 2. ACT
    // Login capacity is 10 for IP burst (TokenBucket) / 5 for account (loginAccount), and 5/60s in wrangler.jsonc.
    // 12 rapid attempts must exhaust capacity and trigger a 429 rate limit.
    for (let i = 0; i < 12; i++) {
      const res = await request.post(`${API}/auth/login`, {
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      })
      statuses.push(res.status())
    }

    // 3. ASSERT RESPONSE
    // Early attempts fail authentication (401), but attempts after capacity is exhausted MUST be rate limited (429).
    const blockedCount = statuses.filter((s) => s === 429).length
    expect(blockedCount).toBeGreaterThan(0)
    expect(statuses[statuses.length - 1]).toBe(429)
  })

  test('consecutive requests to /auth/forgot-password exceed account capacity and receive 429 too_many_requests', async ({ request }) => {
    // 1. ARRANGE
    const payload = { email: 'admin@beechcms.dev' }
    const statuses: number[] = []

    // 2. ACT
    // forgotPasswordAccount has capacity 3 (0.02 tokens/s); forgotPassword IP burst is 5; wrangler binding is 3/60s.
    // Sending 6 requests for the same email must trigger 429 once capacity is exhausted.
    for (let i = 0; i < 6; i++) {
      const res = await request.post(`${API}/auth/forgot-password`, {
        data: payload,
        headers: { 'Content-Type': 'application/json' },
      })
      statuses.push(res.status())
    }

    // 3. ASSERT RESPONSE
    const blockedCount = statuses.filter((s) => s === 429).length
    expect(blockedCount).toBeGreaterThan(0)
    expect(statuses[statuses.length - 1]).toBe(429)
  })

  test('sequential requests to public API decrement the remaining token count', async ({ request }) => {
    // 1. ARRANGE
    // Public read rate limiter starts with capacity 60.
    const headers = { 'X-API-Key': 'dev-public-read-key-changeme' }

    // 2. ACT
    const res1 = await request.get(`${API}/api/v1/public/posts`, { headers })
    const res2 = await request.get(`${API}/api/v1/public/posts`, { headers })

    // 3. ASSERT RESPONSE
    const remaining1 = Number(res1.headers()['x-ratelimit-remaining'])
    const remaining2 = Number(res2.headers()['x-ratelimit-remaining'])

    // In a functioning rate limiter, remaining tokens must decrement with each request.
    // When buckets are recreated per request (Issue #453), remaining1 === remaining2.
    expect(remaining2).toBeLessThan(remaining1)
  })

  test('rapid burst of requests exceeding public write capacity receives 429 too_many_requests', async ({ request }) => {
    // 1. ARRANGE
    const statuses: number[] = []

    // 2. ACT
    // publicApiWrite limiter has capacity 10; wrangler binding is 20/60s.
    // Sending 15 rapid POST requests must trigger 429.
    for (let i = 0; i < 15; i++) {
      const res = await request.post(`${API}/api/v1/public/posts`, {
        data: { title: `Spam Post ${i}` },
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'dev-public-write-key-changeme',
        },
      })
      statuses.push(res.status())
    }

    // 3. ASSERT RESPONSE
    const blockedCount = statuses.filter((s) => s === 429).length
    expect(blockedCount).toBeGreaterThan(0)
    expect(statuses[statuses.length - 1]).toBe(429)
  })

  test('consecutive requests to /auth/refresh exceed capacity and receive 429 too_many_requests', async ({ request }) => {
    // 1. ARRANGE
    const statuses: number[] = []

    // 2. ACT
    // tokenRefresh capacity is 20; wrangler binding is 20/60s.
    // Sending 25 rapid requests must exhaust capacity and trigger 429.
    for (let i = 0; i < 25; i++) {
      const res = await request.post(`${API}/auth/refresh`, {
        headers: { Cookie: 'beech_refresh_token=invalid-or-stale-token' },
      })
      statuses.push(res.status())
    }

    // 3. ASSERT RESPONSE
    const blockedCount = statuses.filter((s) => s === 429).length
    expect(blockedCount).toBeGreaterThan(0)
    expect(statuses[statuses.length - 1]).toBe(429)
  })
})
