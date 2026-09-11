// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { defineConfig, devices } from '@playwright/test'

// Dedicated ports: 8789/5173 belong to `pnpm beech dev`, and an e2e run must never adopt — or be
// adopted by — a developer's live stack.
export const API_PORT = 8799
export const DASHBOARD_PORT = 5273
export const BASE_URL = `http://localhost:${DASHBOARD_PORT}`
export const ADMIN_STATE = './.auth/admin.json'
export const FIXTURE_FILE = './.auth/fixture.json'

// Passed with --var so a run is hermetic: apps/api/.dev.vars is gitignored and absent in CI.
const API_VARS = [
  '--var', 'ENV:development',
  '--var', 'JWT_SECRET:e2e-secret-at-least-32-bytes-long-for-hono-jwt',
  '--var', `CORS_ORIGINS:${BASE_URL}`,
  '--var', `APP_URL:${BASE_URL}`,
  '--var', `MEDIA_BASE_URL:${BASE_URL}`,
].join(' ')

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.e2e\.ts$/,

  // One live D1 shared by every spec. Parallel workers would race on the same rows, and the
  // browser process is far heavier than a Vitest worker on the 8GB fanless target machine.
  workers: 1,
  fullyParallel: false,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // A setup *project*, not globalSetup: a setup project is guaranteed to run after webServer
    // readiness, so provisioning over HTTP can never race the servers it talks to.
    { name: 'setup', testMatch: /global\.setup\.ts$/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STATE },
      dependencies: ['setup'],
    },
  ],

  webServer: [
    {
      command: `node ./scripts/reset-db.mjs && pnpm --filter @beechcms/api exec wrangler dev --port ${API_PORT} --persist-to ../../e2e/.wrangler-e2e ${API_VARS}`,
      url: `http://127.0.0.1:${API_PORT}/auth/setup`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `pnpm --filter @beechcms/dashboard exec vite --port ${DASHBOARD_PORT} --strictPort`,
      url: `${BASE_URL}/admin/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { BEECH_DEV_API_TARGET: `http://127.0.0.1:${API_PORT}` },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
