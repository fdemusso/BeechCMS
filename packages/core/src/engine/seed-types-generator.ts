// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { Seed, Branch } from './types.js'

const HEADER =
  '// Questo file è generato automaticamente da BeechCMS CLI. Non modificarlo direttamente.\n'

/** System columns emitted by generateCreateTable — always present, never optional. */
const SYSTEM_FIELDS =
  `  id: string\n` +
  `  slug: string\n` +
  `  status: 'draft' | 'review' | 'published' | 'archived'\n`

const SYSTEM_TIMESTAMPS =
  `  created_at: number\n` +
  `  updated_at: number\n`

/** slug/alias → PascalCase identifier. 'blog-posts' → 'BlogPosts'. */
export function pascalCase(input: string): string {
  return input
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

function literalUnion(options: string[]): string {
  return options.map(o => `'${o.replace(/'/g, "\\'")}'`).join(' | ')
}

/** Maps a single Branch to its TypeScript type expression (no optional marker). */
export function tsTypeForBranch(branch: Branch): string {
  switch (branch.type) {
    case 'number':
    case 'date':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'json':
      return 'unknown'
    case 'text':
    case 'richtext':
    case 'file': {
      const base =
        branch.type === 'text' && branch.options?.length
          ? literalUnion(branch.options)
          : 'string'
      return branch.type === 'file' && branch.multiple ? `${base}[]` : base
    }
    case 'tags': {
      const base = branch.options?.length ? `(${literalUnion(branch.options)})` : 'string'
      return `${base}[]`
    }
    case 'relation':
      return branch.multiple ? 'string[]' : 'string'
    case 'repeater': {
      const inner = (branch.fields ?? [])
        .map(f => `${propName(f)}${optional(f)}: ${tsTypeForBranch(f)}`)
        .join('; ')
      return `Array<{ ${inner} }>`
    }
    default: {
      // Exhaustiveness guard — fails the build if BranchType gains a member.
      const _never: never = branch.type
      return _never
    }
  }
}

function optional(branch: Branch): string {
  return branch.requiredOnCreate ? '' : '?'
}

function propName(branch: Branch): string {
  // alias is a valid SQL column; quote only if not a plain identifier.
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(branch.alias) ? branch.alias : `'${branch.alias}'`
}

/** Emits one exported interface for a single Seed. */
export function interfaceForSeed(seed: Seed): string {
  const name = pascalCase(seed.slug)
  const props = seed.branches
    .map(b => `  ${propName(b)}${optional(b)}: ${tsTypeForBranch(b)}`)
    .join('\n')
  return (
    `export interface ${name} {\n` +
    SYSTEM_FIELDS +
    (props ? props + '\n' : '') +
    SYSTEM_TIMESTAMPS +
    `}\n`
  )
}

/** Pure entry point. Deterministic: sorts seeds by slug for stable diffs. */
export function generateSeedTypes(seeds: Seed[]): string {
  const sorted = [...seeds].sort((a, b) => a.slug.localeCompare(b.slug))
  const interfaces = sorted.map(interfaceForSeed).join('\n')
  const registryProps = sorted
    .map(s => `  ${propName({ alias: s.slug } as Branch)}: ${pascalCase(s.slug)}`)
    .join('\n')

  const databaseRegistry =
    `export interface BeechDatabase {\n` +
    (registryProps ? registryProps + '\n' : '') +
    `}\n\n` +
    `export type SeedRegistryTypes = BeechDatabase\n`

  return `${HEADER}\n${interfaces}\n${databaseRegistry}`
}

