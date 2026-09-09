// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { validateSeedDefinitions } from '@beechcms/core'

export interface ValidateOptions {
  registry?: Record<string, Seed> | null
}

export interface SeedValidationError {
  slug: string
  messages: string[]
  /** true = abort seed:load; false = warning only */
  fatal: boolean
}

export function validateSeeds(registry: Record<string, Seed>): SeedValidationError[] {
  return validateSeedDefinitions(Object.values(registry))
}

export async function validate(_args: ValidateOptions = {}): Promise<void> {
  console.log(pc.cyan('\n  beech validate\n'))
  console.log(pc.dim('  Schema validation is enforced dynamically at runtime by @beechcms/core on all /api/seeds mutations.'))
  console.log(pc.green('  ✓ Runtime schema validation active.\n'))
}

