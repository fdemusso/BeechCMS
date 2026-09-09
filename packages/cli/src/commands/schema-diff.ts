// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'

export interface SchemaDiffOptions {
  local?: boolean
  write?: boolean
  name?: string
  migrationsDir?: string
  db?: string
  registry?: Record<string, Seed> | null
}

export async function schemaDiff(_args: SchemaDiffOptions = {}): Promise<void> {
  console.log(pc.yellow('\n  ⚠ "beech schema:diff" is deprecated'))
  console.log(pc.dim('  Cloudflare D1 is the canonical authority for schema definitions.'))
  console.log(pc.dim('  Runtime schema mutations are handled automatically by the Botanical Engine.'))
  console.log(pc.cyan('\n  → Schema diffing from static files is no longer supported.\n'))
}

