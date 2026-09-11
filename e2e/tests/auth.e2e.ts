// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — authenticated session.
 * Proves the browser → vite proxy → wrangler → D1 chain end to end, including the refresh-cookie
 * session restore. Credential validation itself is covered by the API integration tier.
 */

import { expect, test } from '@playwright/test'
import { ADMIN_STATE } from '../playwright.config'

test.describe('authenticated dashboard session', () => {
  test('a restored session lands on the dashboard instead of the login route', async ({ page }) => {
    const response = await page.goto('/admin/')

    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(/\/admin\/?$/)
    await expect(page.getByRole('button', { name: 'Login' })).toHaveCount(0)

    // The refresh token rotates and single-use-revokes on every restore (apps/api/src/auth/auth.app.ts
    // POST /auth/refresh). Each Playwright test opens a fresh context from the static ADMIN_STATE
    // snapshot, so the rotated cookie must be written back or the next test's restore is rejected.
    await page.context().storageState({ path: ADMIN_STATE })
  })

  test('signing out returns the browser to the login route', async ({ page }) => {
    // Clear cookies before the first navigation: a goto() while still authenticated would consume
    // this run's single-use refresh token (see the rotation note above) for no assertion this test
    // needs, starving the next test's restore.
    await page.context().clearCookies()
    await page.goto('/admin/')

    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})
