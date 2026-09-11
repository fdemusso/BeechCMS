// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — provisioning.
 * Creates the first administrator, the canonical seeds and one canonical entry through the real
 * HTTP surface, then stores an authenticated browser state for the specs.
 * It holds no D1 handle by design: every table and row it produces is produced by the Botanical
 * Engine inside the worker, exactly as a real operator would produce them.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { test as setup, expect } from '@playwright/test'
import { CANONICAL_SEEDS, CANONICAL_USERS, CANONICAL_ENTRIES } from '@beechcms/testing'
import { API_PORT, ADMIN_STATE, FIXTURE_FILE } from '../playwright.config'

const API = `http://127.0.0.1:${API_PORT}`
const admin = CANONICAL_USERS.admin

export interface E2eFixture {
  readonly seedSlug: string
  readonly entryId: string
  readonly entryTitle: string
}

setup('provisions the canonical world and stores an authenticated state', async ({ page, request }) => {
  const status = await request.get(`${API}/auth/setup`)
  expect(status.status()).toBe(200)
  const { needsSetup } = await status.json() as { needsSetup: boolean }
  expect(needsSetup).toBe(true)

  // track 'developer' without demo data: the suite asserts on the canonical seeds only, and the
  // five DEMO_SEED_DEFINITIONS would add content types no spec accounts for.
  const created = await request.post(`${API}/auth/setup`, {
    data: {
      email: admin.email,
      password: admin.password,
      name: admin.name,
      surname: 'E2E',
      track: 'developer',
      loadDemoData: false,
      settings: { language: 'en', timezone: 'UTC', currency: 'EUR' },
    },
  })
  expect(created.status()).toBe(201)

  const login = await request.post(`${API}/auth/login`, {
    data: { email: admin.email, password: admin.password },
  })
  expect(login.status()).toBe(200)
  const { token } = await login.json() as { token: string }
  const authed = { Authorization: `Bearer ${token}` }

  // Seeds are posted in declaration order: 'posts' carries a relation branch targeting 'authors'
  // (br_08), which must already exist when the engine validates it.
  for (const seed of CANONICAL_SEEDS) {
    const response = await request.post(`${API}/api/seeds`, { headers: authed, data: seed })
    expect(response.status()).toBe(201)
  }

  const canonicalEntry = CANONICAL_ENTRIES[0]
  if (!canonicalEntry) throw new Error('CANONICAL_ENTRIES is empty')

  const entry = await request.post(`${API}/api/content/${canonicalEntry.seedSlug}`, {
    headers: authed,
    data: canonicalEntry.data,
  })
  expect(entry.status()).toBe(201)
  const { id } = await entry.json() as { id: string }

  const seedForEntry = CANONICAL_SEEDS.find((s) => s.slug === canonicalEntry.seedSlug)
  if (!seedForEntry) throw new Error(`no canonical seed for ${canonicalEntry.seedSlug}`)
  const titleAlias = seedForEntry.displayNameAlias
  const fixture: E2eFixture = {
    seedSlug: canonicalEntry.seedSlug,
    entryId: id,
    entryTitle: String(canonicalEntry.data[titleAlias]),
  }
  mkdirSync(dirname(FIXTURE_FILE), { recursive: true })
  writeFileSync(FIXTURE_FILE, JSON.stringify(fixture, null, 2), 'utf8')

  await page.goto('/admin/login')
  await page.getByLabel('Email', { exact: true }).fill(admin.email)
  // exact: true — the show/hide-password toggle button carries an aria-label containing
  // "password" too ("Show password"), which a substring match on getByLabel would also resolve.
  await page.getByLabel('Password', { exact: true }).fill(admin.password)
  await page.getByRole('button', { name: 'Login' }).click()
  // safeReturnTo(null) navigates to '/', which react-router's basename joining renders as
  // '/admin' with no trailing slash (verified against the real post-login navigation).
  await page.waitForURL(/\/admin\/?$/)

  // The dashboard keeps the access token in memory and re-derives the session from the HttpOnly
  // refresh cookie on mount (lib/auth-context.tsx). Cookies are therefore the whole state; a
  // localStorage-only snapshot would resume logged out.
  await page.context().storageState({ path: ADMIN_STATE })
})
