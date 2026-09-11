// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { IClock, ITokenService, IHashProvider, Seed } from '@beechcms/core'
import { FixedClock } from './services/fixed-clock'
import { FakeTokenService } from './services/fake-token.service'
import { TEST_ENV, type TestEnv } from './env'
import { CANONICAL_SEEDS } from './seeds/canonical.seeds'
import { CANONICAL_USERS, type CanonicalUser, type CanonicalUserKey } from './seeds/canonical.data'
import { provisionSeeds, resetContentTables, seedUsers } from './seeds/provision'
import { createTestClient, type TestClient } from './client/test-client'

/** Structural type of a Hono app — keeps this package independent of `@beechcms/api`. */
export interface TestApp {
  request(input: string, init?: RequestInit, env?: unknown, executionCtx?: unknown): Response | Promise<Response>
}

/** The only services the harness is allowed to fake. Mirrors `AuthProviderOverrides` in apps/api. */
export interface HarnessAuthProviders {
  clock: IClock
  tokenService: ITokenService
  hashProvider?: IHashProvider
}

export interface HarnessOptions {
  /** Real D1 binding from `cloudflare:test`'s `env.DB`. */
  db: D1Database
  /**
   * Builds the app under test. The caller closes over `createBeechApp` so this package
   * never depends on `@beechcms/api` (which depends on nothing here — no workspace cycle).
   * Pass the overrides straight through: `(authProviders) => createBeechApp({ authProviders })`.
   */
  createApp(authProviders: HarnessAuthProviders): TestApp
  /** Defaults to `CANONICAL_SEEDS`. Pass a narrower list only when the suite needs it. */
  seeds?: readonly Seed[]
  /** Defaults to every canonical user. */
  users?: readonly CanonicalUser[]
  /** Frozen start time, epoch ms. Defaults to 2026-01-01T00:00:00Z. */
  nowMs?: number
  /** Extra `Bindings` merged over `TEST_ENV`. */
  env?: Record<string, unknown>
}

export interface TestHarness {
  readonly app: TestApp
  readonly db: D1Database
  readonly clock: FixedClock
  readonly tokenService: FakeTokenService
  readonly env: TestEnv & Record<string, unknown>
  /** Authenticated client. Injects `Authorization: Bearer <fake token>` on every request. */
  asUser(user: CanonicalUserKey | CanonicalUser, options?: { ttlSeconds?: number }): Promise<TestClient>
  /** Unauthenticated client — for public-API and 401 assertions. */
  anonymous(): TestClient
}

const DEFAULT_NOW_MS = Date.UTC(2026, 0, 1)

export async function createTestHarness(options: HarnessOptions): Promise<TestHarness> {
  const clock = new FixedClock(options.nowMs ?? DEFAULT_NOW_MS)
  const tokenService = new FakeTokenService(clock)
  const env = { ...TEST_ENV, ...options.env, DB: options.db }

  const seeds = options.seeds ?? CANONICAL_SEEDS
  await provisionSeeds(options.db, seeds, clock.nowSeconds())
  await resetContentTables(options.db, seeds)
  await seedUsers(options.db, options.users ?? Object.values(CANONICAL_USERS))

  const app = options.createApp({ clock, tokenService })

  return {
    app,
    db: options.db,
    clock,
    tokenService,
    env,
    anonymous: () => createTestClient(app, env, {}),
    async asUser(user, tokenOptions) {
      const resolved = typeof user === 'string' ? CANONICAL_USERS[user] : user
      const token = await tokenService.issue(
        { sub: resolved.id, email: resolved.email, name: resolved.name, role: resolved.role },
        tokenOptions?.ttlSeconds === undefined ? undefined : { ttlSeconds: tokenOptions.ttlSeconds },
      )
      return createTestClient(app, env, { Authorization: `Bearer ${token}` })
    },
  }
}
