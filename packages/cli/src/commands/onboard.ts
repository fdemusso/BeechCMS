// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { init } from './init.js'
import { seedLoad } from './seed-load.js'

export interface OnboardOptions {
  local: boolean
  yes: boolean
  db?: string
  registry?: Record<string, Seed> | null
}

export async function onboard(args: OnboardOptions): Promise<void> {
  console.log(pc.cyan('\n  beech onboard — full provisioning\n'))

  // Step 1: file check + DB init
  await init({ initDb: true, local: args.local, db: args.db, nonInteractive: args.yes })

  // Step 2: create content tables + register definitions + bump registry_version
  await seedLoad({ dryRun: false, diff: false, local: args.local, db: args.db, registry: args.registry ?? null })

  // Step 3: next steps
  console.log(pc.cyan('\n  Provisioning complete.\n'))
  console.log(pc.dim('  Next steps:'))
  console.log(pc.cyan('  1. npx wrangler dev'))
  console.log(pc.dim('      → start API + dashboard'))
  console.log(pc.dim('  2. Open http://localhost:8789/admin'))
  console.log(pc.dim('      → complete setup wizard to create admin user\n'))
}
