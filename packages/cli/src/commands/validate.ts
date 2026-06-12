// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { SEED_REGISTRY, validateSeedDefinitions } from '@beechcms/core'

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

export async function validate(args: ValidateOptions): Promise<void> {
  const registry = args.registry ?? SEED_REGISTRY

  if (Object.keys(registry).length === 0) {
    console.warn(pc.yellow('\n  Warning: SEED_REGISTRY is empty. Create a seeds.ts in your project root.\n'))
    return
  }

  console.log(pc.cyan('\n  beech validate — checking seeds\n'))

  const errors = validateSeeds(registry)
  const fatalErrors = errors.filter(e => e.fatal)
  const warnings = errors.filter(e => !e.fatal)

  // Print fatal errors first
  for (const e of fatalErrors) {
    console.log(pc.red(`  ✗ ${e.slug} (fatal)`))
    for (const msg of e.messages) {
      console.log(pc.red(`      → ${msg}`))
    }
  }

  // Print per-seed warnings
  const warningMap = new Map(warnings.map(e => [e.slug, e.messages]))
  const allWarningSlugsSeen = new Set(warnings.map(e => e.slug))

  for (const seed of Object.values(registry)) {
    const msgs = warningMap.get(seed.slug)
    if (!msgs) {
      if (!allWarningSlugsSeen.has(seed.slug)) {
        // only print ✓ if no fatal error for this slug either
        const hasFatal = fatalErrors.some(e => e.slug === seed.slug)
        if (!hasFatal) console.log(pc.green(`  ✓ ${seed.slug}`))
      }
    } else {
      console.log(pc.yellow(`  ⚠ ${seed.slug}`))
      for (const msg of msgs) {
        console.log(pc.yellow(`      → ${msg}`))
      }
    }
  }

  console.log('')

  const totalFatal = fatalErrors.reduce((n, e) => n + e.messages.length, 0)
  const totalWarnings = warnings.reduce((n, e) => n + e.messages.length, 0)

  if (totalFatal > 0) {
    const s = totalFatal !== 1 ? 's' : ''
    console.log(pc.red(`  Found ${totalFatal} fatal error${s}. Fix before loading.\n`))
    process.exit(1)
  } else if (totalWarnings > 0) {
    const s = totalWarnings !== 1 ? 's' : ''
    console.log(pc.yellow(`  Found ${totalWarnings} warning${s}. Review seeds above.\n`))
  } else {
    console.log(pc.green('  All seeds valid.\n'))
  }
}
