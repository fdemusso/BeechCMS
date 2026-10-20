// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

// Recreates the e2e database from scratch: the suite asserts on an exact row set, so a run that
// inherited rows from the previous run would pass or fail for reasons no spec states.

import { rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const E2E_DIR = resolve(SCRIPT_DIR, '..')
const ROOT = resolve(E2E_DIR, '..')
const PERSIST_DIR = join(E2E_DIR, '.wrangler-e2e')

rmSync(PERSIST_DIR, { recursive: true, force: true })
rmSync(join(E2E_DIR, '.auth'), { recursive: true, force: true })

execFileSync('node', [join(ROOT, 'apps/api/scripts/bootstrap-d1.mjs')], {
  cwd: join(ROOT, 'apps/api'),
  stdio: 'inherit',
  env: { ...process.env, BEECH_D1_PERSIST_DIR: PERSIST_DIR },
})

console.log(`[e2e] database reset at ${PERSIST_DIR}`)
