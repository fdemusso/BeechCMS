// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, expect, it } from 'vitest'
import type { Branch, Seed } from '../types.js'
import type { SchemaQueryExecutor } from '../introspection/introspection.js'
import { tagOptionsIssues } from './tag-options.js'
import {
  TAG_MIGRATION_PALETTE,
  findTagOrphans,
  manualTagSteps,
  planTagMigration,
  tagMigrationStatements,
} from './tag-migration.js'

function seedWith(branches: Array<Record<string, unknown>>, extra: Partial<Seed> = {}): Seed {
  return {
    slug: 'tickets',
    label: 'Ticket',
    displayNameAlias: 'title',
    branches: [
      { id: 'br_01', alias: 'title', label: 'Title', type: 'text' },
      ...branches.map((branch, index) => ({ id: `br_${String(index + 2).padStart(2, '0')}`, label: 'Field', ...branch })),
    ] as Branch[],
    ...extra,
  } as Seed
}

function branchOf(seed: Seed, alias: string): Branch {
  const branch = seed.branches.find(candidate => candidate.alias === alias)
  if (!branch) throw new Error(`branch ${alias} missing`)
  return branch
}

describe('planTagMigration', () => {
  it('produces no step and no rewritten seed for definitions that already honour the contract', () => {
    const seed = seedWith([
      { alias: 'priority', type: 'tags', multiple: false, options: [{ value: 'low', color: '#64748b' }] },
      { alias: 'labels', type: 'tags' },
    ])

    const plan = planTagMigration([seed])

    expect(plan.steps).toEqual([])
    expect(plan.seeds).toEqual([])
  })

  it('turns text + string options into single-choice tags with colored options in declared order', () => {
    const seed = seedWith([{ alias: 'status', type: 'text', options: ['open', 'closed'] }])

    const plan = planTagMigration([seed])

    const migrated = branchOf(plan.seeds[0], 'status')
    expect(plan.steps).toMatchObject([{ seed: 'tickets', alias: 'status', action: 'text-to-tags' }])
    expect(migrated).toMatchObject({ type: 'tags', multiple: false })
    expect(migrated.options).toEqual([
      { value: 'open', color: TAG_MIGRATION_PALETTE[0] },
      { value: 'closed', color: TAG_MIGRATION_PALETTE[1] },
    ])
    expect(tagOptionsIssues(migrated)).toEqual([])
  })

  it('keeps multiple and valid colors when tags carry string options or object options with a bad color', () => {
    const seed = seedWith([
      { alias: 'labels', type: 'tags', options: ['bug', { value: 'ui', color: '#123456' }, { value: 'api', color: 'red' }] },
    ])

    const plan = planTagMigration([seed])

    const migrated = branchOf(plan.seeds[0], 'labels')
    expect(plan.steps).toMatchObject([{ alias: 'labels', action: 'tags-options' }])
    expect(migrated.multiple).toBeUndefined()
    expect(migrated.options).toEqual([
      { value: 'bug', color: TAG_MIGRATION_PALETTE[0] },
      { value: 'ui', color: '#123456' },
      { value: 'api', color: TAG_MIGRATION_PALETTE[2] },
    ])
  })

  it('normalizes option values and drops duplicates', () => {
    const seed = seedWith([{ alias: 'status', type: 'text', options: [' open ', 'open', 'closed'] }])

    const plan = planTagMigration([seed])

    expect(branchOf(plan.seeds[0], 'status').options?.map(option => option.value)).toEqual(['open', 'closed'])
  })

  it('is idempotent: planning an already migrated seed yields nothing', () => {
    const first = planTagMigration([seedWith([{ alias: 'status', type: 'text', options: ['open'] }])])

    const second = planTagMigration(first.seeds)

    expect(second.steps).toEqual([])
  })

  it('asks for a manual fix and leaves the seed unrewritten when options sit on an unsupported type', () => {
    const seed = seedWith([
      { alias: 'status', type: 'text', options: ['open'] },
      { alias: 'score', type: 'number', options: ['1', '2'] },
    ])

    const plan = planTagMigration([seed])

    expect(manualTagSteps(plan)).toMatchObject([{ alias: 'score', action: 'manual' }])
    expect(plan.seeds).toEqual([])
  })

  it('asks for a manual fix when a repeater sub-field carries the legacy shape', () => {
    const seed = seedWith([
      {
        alias: 'rows', type: 'repeater',
        fields: [{ id: 'br_90', alias: 'kind', label: 'Kind', type: 'text', options: ['a', 'b'] }],
      },
    ])

    const plan = planTagMigration([seed])

    expect(manualTagSteps(plan)).toMatchObject([{ alias: 'rows', action: 'manual' }])
  })

  it('asks for a manual fix for a localized text branch because its stored dictionary cannot be wrapped', () => {
    const seed = seedWith([{ alias: 'status', type: 'text', localized: true, options: ['open'] }])

    const plan = planTagMigration([seed])

    expect(manualTagSteps(plan)).toMatchObject([{ alias: 'status' }])
  })
})

describe('tagMigrationStatements', () => {
  it('wraps stored values before rewriting the definition and bumps the registry version last', () => {
    const seed = seedWith([{ alias: 'status', type: 'text', options: ['open'] }])
    const plan = planTagMigration([seed])

    const statements = tagMigrationStatements(plan, [seed])

    expect(statements[0]).toContain('UPDATE content_tickets SET status = NULL')
    expect(statements[1]).toContain('json_array(status)')
    expect(statements.at(-2)).toMatch(/^UPDATE seeds SET definition = '/)
    expect(statements.at(-1)).toContain("id = 'registry_version'")
  })

  it('also wraps the drafts table when the seed has drafts enabled', () => {
    const seed = seedWith([{ alias: 'status', type: 'text', options: ['open'] }], { allowDrafts: true })
    const plan = planTagMigration([seed])

    const statements = tagMigrationStatements(plan, [seed])

    expect(statements.some(statement => statement.includes('content_tickets_drafts'))).toBe(true)
  })

  it('does not touch stored values when only the options shape changes', () => {
    const seed = seedWith([{ alias: 'labels', type: 'tags', options: ['bug'] }])
    const plan = planTagMigration([seed])

    const statements = tagMigrationStatements(plan, [seed])

    expect(statements.some(statement => statement.includes('json_array'))).toBe(false)
  })

  it('escapes single quotes inside the serialized definition', () => {
    const seed = seedWith([{ alias: 'status', type: 'text', options: ["it's open"] }])
    const plan = planTagMigration([seed])

    const statements = tagMigrationStatements(plan, [seed])

    expect(statements.some(statement => statement.includes("it''s open"))).toBe(true)
  })

  it('emits nothing for a plan with no automatic work', () => {
    const seed = seedWith([{ alias: 'score', type: 'number', options: ['1'] }])

    const statements = tagMigrationStatements(planTagMigration([seed]), [seed])

    expect(statements).toEqual([])
  })
})

describe('findTagOrphans', () => {
  it('reports stored values missing from the new vocabulary without altering anything', async () => {
    const seed = seedWith([{ alias: 'status', type: 'text', options: ['open'] }])
    const plan = planTagMigration([seed])
    const issued: string[] = []
    const executor: SchemaQueryExecutor = {
      all: <T extends Record<string, unknown>>(sql: string): Promise<T[]> => {
        issued.push(sql)
        return Promise.resolve([{ value: 'legacy', n: 3 }] as unknown as T[])
      },
    }

    const orphans = await findTagOrphans(executor, plan, [seed])

    expect(orphans).toEqual([{ seed: 'tickets', alias: 'status', value: 'legacy', rows: 3 }])
    expect(issued.every(sql => sql.startsWith('SELECT'))).toBe(true)
  })
})
