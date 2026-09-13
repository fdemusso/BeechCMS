// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * e2e tier — bulk transfer dashboard (S4).
 * The centerpiece is the real thing a browser-only or an API-only test cannot prove alone: a
 * user picks a file in the wizard, it is genuinely presigned and PUT to MinIO, the API creates
 * and processes the job asynchronously (real `executionCtx.waitUntil`, not the vitest harness's
 * synchronous inline queue) across real chunk continuations at volume, and the dashboard's
 * polling renders it through to `completed` — partial failures included — with the successful
 * rows readable back through the real API. It imports against `posts`, the richest canonical
 * seed (10 branches: text/richtext/number/file/tags/3 relations), not the trivial single-field
 * `categories`, so this is also the only tier proving the wizard survives a schema with that
 * shape end to end. The export menu and the wizard's CSV-disable state are covered alongside it
 * because both are driven by a seed fetched from the real API rather than a hand-rolled fixture —
 * dashboard unit tests only ever pass a stubbed Seed.
 */

import { expect, test } from '@playwright/test'
import { CANONICAL_USERS } from '@beechcms/testing'
import { ADMIN_STATE, API_PORT } from '../playwright.config'

const API = `http://127.0.0.1:${API_PORT}`
const admin = CANONICAL_USERS.admin

const POSTS_CSV_DISABLED_TEXT =
  'CSV disabled: tags, author_id, category_id, related_posts cannot be represented as flat columns'

test.describe('bulk transfer — export', () => {
  test('exporting the categories seed as NDJSON downloads a real file from the export endpoint', async ({ page }) => {
    const response = await page.goto('/admin/content/categories')
    expect(response?.status()).toBe(200)

    await page.getByRole('button', { name: 'Export / Import' }).click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'NDJSON' }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toBe('categories.ndjson')

    // See auth.e2e.ts: the refresh token single-use-rotates on restore, so the next test's fresh
    // context needs this test's rotated cookie written back to the shared state file.
    await page.context().storageState({ path: ADMIN_STATE })
  })

  test('CSV export is disabled for a seed with non-flat branches, naming every offending branch', async ({ page }) => {
    const response = await page.goto('/admin/content/posts')
    expect(response?.status()).toBe(200)

    await page.getByRole('button', { name: 'Export / Import' }).click()

    await expect(page.getByRole('menuitem', { name: 'CSV' })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByText(POSTS_CSV_DISABLED_TEXT)).toBeVisible()

    await page.context().storageState({ path: ADMIN_STATE })
  })
})

test.describe('bulk transfer — import wizard', () => {
  test("the wizard's format choice mirrors the export menu's non-flat contract, for a seed fetched from the real API", async ({
    page,
  }) => {
    const response = await page.goto('/admin/content/posts')
    expect(response?.status()).toBe(200)

    await page.getByRole('button', { name: 'Export / Import' }).click()
    await page.getByRole('menuitem', { name: 'Import…' }).click()

    await expect(page.getByRole('dialog', { name: 'Import into Post' })).toBeVisible()
    await expect(page.locator('#import-format-csv')).toBeDisabled()
    await expect(page.locator('#import-format-ndjson')).toBeChecked()
    await expect(page.getByText(POSTS_CSV_DISABLED_TEXT)).toBeVisible()

    await page.context().storageState({ path: ADMIN_STATE })
  })

  test('a 1000-row import against the complex posts seed spans two real chunk continuations and reports its 20 failures, with the successful rows readable back through the API', async ({
    page,
    request,
  }) => {
    test.setTimeout(90_000) // 1000 real D1 writes across 2 real chunk continuations, not the 30s default

    const titlePrefix = 'E2E '
    // 1000 rows against `posts` (10 branches: text/richtext/number/file/tags/3 relations) — every
    // 50th row omits the required `title` branch, so this is both a volume proof (2 real
    // continuations past DEFAULT_IMPORT_CHUNK_ROWS=500) and a partial-failure proof: the chunk
    // worker must keep inserting the other 49 rows in the same chunk, not abort it.
    // The zero-padded index sits right after the prefix so it survives slugify's 15-char slug
    // cap (packages/core/src/content/slug-utils.ts) — every title collapsing to the same
    // truncated slug (the bug this once caught: 999/1000 rows failing `duplicate_slug` instead
    // of the intended 20) is exactly the failure this ordering rules out.
    const rows: string[] = []
    let expectedFailures = 0
    for (let i = 0; i < 1000; i++) {
      if (i % 50 === 49) {
        rows.push(JSON.stringify({ body: 'missing the required title branch' }))
        expectedFailures++
      } else {
        rows.push(JSON.stringify({ title: `${titlePrefix}${String(i).padStart(4, '0')} bulk import row` }))
      }
    }
    const expectedInserted = 1000 - expectedFailures
    const ndjson = rows.join('\n') + '\n'

    const response = await page.goto('/admin/content/posts')
    expect(response?.status()).toBe(200)

    await page.getByRole('button', { name: 'Export / Import' }).click()
    await page.getByRole('menuitem', { name: 'Import…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Import into Post' })
    await expect(dialog).toBeVisible()
    // 'posts' is non-flat, so the wizard already defaults format to NDJSON — see the sibling test
    // above for the CSV-disabled contract.
    await expect(page.locator('#import-format-ndjson')).toBeChecked()

    await page.locator('#import-file-input').setInputFiles({
      name: 'posts-bulk.ndjson',
      mimeType: 'application/json',
      buffer: Buffer.from(ndjson),
    })
    await page.getByRole('button', { name: 'Upload and start import' }).click()

    // Real async processing (executionCtx.waitUntil in workerd, unlike the vitest harness's
    // inline-awaited queue): two chunks of up to 500 rows each, polled every IMPORT_JOB_POLL_MS.
    await expect(dialog.getByText('Completed')).toBeVisible({ timeout: 60_000 })

    const dl = dialog.locator('dl > div')
    await expect(dl.filter({ hasText: 'Rows read' }).getByText('1000', { exact: true })).toBeVisible()
    await expect(dl.filter({ hasText: 'Inserted' }).getByText(String(expectedInserted), { exact: true })).toBeVisible()
    await expect(dl.filter({ hasText: 'Failed' }).getByText(String(expectedFailures), { exact: true })).toBeVisible()

    // MAX_JOB_ERROR_SAMPLES is 100 (packages/core/src/transfer/transfer.constants.ts) — well above
    // this file's 20 failures, so every one renders as its own row rather than being capped.
    // Scoped to the dialog: the content-list table underneath the modal has its own <tbody tr>.
    await expect(dialog.locator('tbody tr')).toHaveCount(expectedFailures)
    await expect(dialog.getByRole('cell', { name: 'validation_failed' }).first()).toBeVisible()

    await page.context().storageState({ path: ADMIN_STATE })

    const login = await request.post(`${API}/auth/login`, {
      data: { email: admin.email, password: admin.password },
    })
    const { token } = await login.json() as { token: string }
    // `search` forces the {items, total, ...} envelope (list.ts's hasQueryParams branch); `total`
    // reflects every matching row, unlike `items`, which list.ts caps at 100 regardless of `limit`
    // — with 980 matches, counting `items` directly would undercount.
    const list = await request.get(`${API}/api/content/posts`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { search: 'E2E', limit: 1 },
    })
    expect(list.status()).toBe(200)
    const body = await list.json() as { items: Array<{ title: string }>; total: number }
    expect(body.total).toBe(expectedInserted)
    expect(body.items[0]?.title.startsWith(titlePrefix)).toBe(true)

    // Clean up: this run's rows would otherwise sit in `posts` and push the canonical fixture
    // entry ("Canonical Post", asserted by content-id-contract.e2e.ts) off the default list
    // page for every spec that runs after this one against the same shared D1. There is no bulk
    // delete route (only PATCH /:slug/bulk for edits), so each row is removed individually.
    const authHeaders = { Authorization: `Bearer ${token}` }
    const idsToDelete: string[] = []
    for (let page = 1; idsToDelete.length < expectedInserted; page++) {
      const pageResponse = await request.get(`${API}/api/content/posts`, {
        headers: authHeaders,
        params: { search: 'E2E', limit: 100, page },
      })
      const pageBody = await pageResponse.json() as { items: Array<{ id: string }> }
      if (pageBody.items.length === 0) break
      idsToDelete.push(...pageBody.items.map((item) => item.id))
    }
    expect(idsToDelete).toHaveLength(expectedInserted)
    await Promise.all(idsToDelete.map((id) => request.delete(`${API}/api/content/posts/${id}`, { headers: authHeaders })))
  })
})
