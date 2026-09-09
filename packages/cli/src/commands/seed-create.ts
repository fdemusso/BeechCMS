// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'

export type SeedCreateOptions = Record<string, never>

export async function seedCreate(_args: SeedCreateOptions = {}): Promise<void> {
  console.log(pc.yellow('\n  ⚠ "beech seed:create" is deprecated'))
  console.log(pc.dim('  Content schemas in BeechCMS are managed dynamically at runtime in Cloudflare D1.'))
  console.log(pc.cyan('\n  → Create new content types directly in the BeechCMS Dashboard (/admin) or via POST /api/seeds.\n'))
}

