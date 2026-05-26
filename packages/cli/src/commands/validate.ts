// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import pc from 'picocolors'
import type { Seed } from '@beechcms/core'
import { SEED_REGISTRY } from '@beechcms/core'

export interface ValidateOptions {
  registry?: Record<string, Seed> | null
}

export interface SeedValidationError {
  slug: string
  messages: string[]
}

export function validateSeeds(registry: Record<string, Seed>): SeedValidationError[] {
  const result: SeedValidationError[] = []
  const slugsSeen = new Set<string>()

  for (const seed of Object.values(registry)) {
    const messages: string[] = []

    if (slugsSeen.has(seed.slug)) {
      messages.push(`duplicate slug "${seed.slug}" — each seed must have a unique slug`)
    }
    slugsSeen.add(seed.slug)

    const aliasesSeen = new Set<string>()
    for (const branch of seed.branches) {
      if (aliasesSeen.has(branch.alias)) {
        messages.push(`duplicate branch alias "${branch.alias}"`)
      }
      aliasesSeen.add(branch.alias)
    }

    const allAliases = new Set(seed.branches.map(b => b.alias))
    if (!allAliases.has(seed.displayNameAlias)) {
      messages.push(`displayNameAlias "${seed.displayNameAlias}" not found in branches`)
    }

    if (messages.length > 0) {
      result.push({ slug: seed.slug, messages })
    }
  }

  return result
}

export async function validate(args: ValidateOptions): Promise<void> {
  const registry = args.registry ?? SEED_REGISTRY

  if (Object.keys(registry).length === 0) {
    console.warn(pc.yellow('\n  Warning: SEED_REGISTRY is empty. Create a seeds.ts in your project root.\n'))
    return
  }

  console.log(pc.cyan('\n  beech validate — checking seeds\n'))

  const errors = validateSeeds(registry)
  const errorMap = new Map(errors.map(e => [e.slug, e.messages]))

  let totalIssues = 0
  for (const seed of Object.values(registry)) {
    const msgs = errorMap.get(seed.slug)
    if (!msgs) {
      console.log(pc.green(`  ✓ ${seed.slug}`))
    } else {
      totalIssues += msgs.length
      console.log(pc.red(`  ✗ ${seed.slug}`))
      for (const msg of msgs) {
        console.log(pc.red(`      → ${msg}`))
      }
    }
  }

  console.log('')

  if (totalIssues > 0) {
    const s = totalIssues !== 1 ? 's' : ''
    console.log(pc.red(`  Found ${totalIssues} issue${s}. Fix the seeds above before loading.\n`))
    process.exit(1)
  } else {
    console.log(pc.green('  All seeds valid.\n'))
  }
}
