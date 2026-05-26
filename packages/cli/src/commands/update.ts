// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import { spawnSync } from 'node:child_process'

export interface UpdateOptions {}

export async function update(_args: UpdateOptions): Promise<void> {
  console.log(pc.cyan('\n  beech update\n'))

  // Step 1 — install latest BeechCMS packages
  console.log(pc.dim('  [1/2] Installing latest BeechCMS packages…\n'))
  const installResult = spawnSync(
    'npm',
    ['install', '@beechcms/api@latest', '@beechcms/core@latest'],
    { stdio: 'inherit', cwd: process.cwd(), shell: true }
  )

  if (installResult.status !== 0) {
    console.log(pc.red('\n  ✗ npm install failed\n'))
    console.log(pc.dim('  Check the output above for details.'))
    console.log(pc.dim('  You may need to resolve version conflicts manually.'))
    console.log(pc.cyan('\n  → Try: npm install --legacy-peer-deps\n'))
    process.exit(1)
  }

  console.log(pc.green('\n  ✓ Packages updated'))

  // Step 2 — apply any new system migrations to local DB
  console.log(pc.dim('\n  [2/2] Applying system migrations to local database…\n'))
  const initResult = spawnSync(
    'npx',
    ['beech', 'init', '--db', '--local'],
    { stdio: 'inherit', cwd: process.cwd(), shell: true }
  )

  if (initResult.status !== 0) {
    console.log(pc.yellow('\n  ⚠ Local DB update failed\n'))
    console.log(pc.dim('  Apply system migrations manually:'))
    console.log(pc.cyan('  → Run: npx beech init --db --local\n'))
  } else {
    console.log(pc.green('\n  ✓ Local database updated'))
  }

  console.log(pc.dim('\n  Local update complete.\n'))
  console.log(pc.dim('  Next steps:'))
  console.log(pc.cyan('  1. npx beech seed:load --local'))
  console.log(pc.dim('      → sync content schema to local DB'))
  console.log(pc.cyan('  2. npm run deploy'))
  console.log(pc.dim('      → deploy updated API + dashboard'))
  console.log(pc.cyan('  3. npx beech seed:load'))
  console.log(pc.dim('      → sync remote schema\n'))
}
