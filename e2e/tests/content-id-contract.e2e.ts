// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — entry-id contract across the dashboard/API boundary.
 * Guards the defect class behind issue #108: an id minted by the API must be an id the dashboard
 * can address. No static analysis can observe this — graphify finds no path from ContentListPage
 * to createBeechApp, because the only edge between them is HTTP.
 */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { UUID_V4_PATTERN } from '@beechcms/testing'
import { ADMIN_STATE, FIXTURE_FILE } from '../playwright.config'
import type { E2eFixture } from './global.setup'

// Playwright imports every spec file during collection, before the 'setup' project (which writes
// FIXTURE_FILE) has run. Reading it here, at module scope, would throw during collection itself.
let fixture: E2eFixture

test.beforeAll(() => {
  fixture = JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')) as E2eFixture
})

test.describe('content entry id contract', () => {
  test('the API mints the entry id in the production format', () => {
    expect(fixture.entryId).toMatch(UUID_V4_PATTERN)
  })

  test('the list view renders an entry created through the real API', async ({ page }) => {
    const response = await page.goto(`/admin/content/${fixture.seedSlug}`)

    expect(response?.status()).toBe(200)
    await expect(page.getByText(fixture.entryTitle)).toBeVisible()

    // See auth.e2e.ts: the refresh token single-use-rotates on restore, so the next test's fresh
    // context needs this test's rotated cookie written back to the shared state file.
    await page.context().storageState({ path: ADMIN_STATE })
  })

  test('the detail route resolves an API-minted id without a client-side rewrite', async ({ page }) => {
    const response = await page.goto(`/admin/content/${fixture.seedSlug}/${fixture.entryId}`)

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(`/admin/content/${fixture.seedSlug}/${fixture.entryId}`)
    await expect(page.getByText(fixture.entryTitle)).toBeVisible()
  })
})
