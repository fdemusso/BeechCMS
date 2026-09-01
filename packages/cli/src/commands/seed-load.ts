// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'

export interface SeedLoadOptions {
  dryRun?: boolean
  diff?: boolean
  local?: boolean
  db?: string
  registry?: Record<string, Seed> | null
}

export async function seedLoad(_args: SeedLoadOptions = {}): Promise<void> {
  console.log(pc.yellow('\n  ⚠ "beech seed:load" is deprecated'))
  console.log(pc.dim('  Content schemas in BeechCMS are managed dynamically at runtime in Cloudflare D1.'))
  console.log(pc.dim('  Static seeds.ts files are no longer synchronized to the database.'))
  console.log(pc.cyan('\n  → To manage content types, open the dashboard at /admin or use the /api/seeds API.\n'))
}

