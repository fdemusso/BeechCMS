// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const migrations = await readD1Migrations(path.join(dirname, 'migrations'))

export default defineConfig({
  test: {
    name: 'scale',
    include: ['src/features/**/test/scale/**/*.scale.test.ts'],
    setupFiles: ['./test/harness/apply-migrations.ts'],
    reporters: ['verbose'],
    silent: 'passed-only',
  },
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2026-02-13',
        compatibilityFlags: ['nodejs_compat'],
        d1Databases: ['DB'],
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
})
