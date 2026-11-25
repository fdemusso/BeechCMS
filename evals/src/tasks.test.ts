// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { CANONICAL_SEEDS } from '../../packages/testing/src/seeds/canonical.seeds.ts'
import {
  addBranchTask, authorReportTask, automationRuleCreateTask, bulkTagTask, businessRuleHooksTask,
  createManyTask, createSeedTask, EVAL_SUITE, purgeIntentTask, seedDeleteIntentTask, trashRestoreTask,
} from './tasks.ts'

type Entry = Record<string, unknown>
const list = (items: Entry[]) => ({ items, total: items.length })
const seedResponse = (branches: Array<Record<string, unknown>>, status = 'active') => ({ status: 200, body: { slug: 's', status, definition: { branches } } })
const intent = (overrides: Record<string, unknown>) => ({ id: 'i1', operationId: 'content.delete', path: '/api/content/posts/t1', risk: 'destructive', status: 'pending', body: null, ...overrides })

const canonicalPostsBranches = (CANONICAL_SEEDS.find(seed => seed.slug === 'posts')?.branches ?? []).map(({ id, alias, type }) => ({ id, alias, type }))

describe('addBranchTask.check', () => {
  it('passes when reading_time is a number branch and the canonical branches are unchanged', () => {
    const snapshot = seedResponse([...canonicalPostsBranches, { id: 'br_12', alias: 'reading_time', type: 'number' }])

    const verdict = addBranchTask.check(snapshot)

    expect(verdict.success).toBe(true)
  })

  it('fails when a canonical branch changed type', () => {
    const changed = canonicalPostsBranches.map(branch => (branch.alias === 'view_count' ? { ...branch, type: 'text' } : branch))
    const snapshot = seedResponse([...changed, { id: 'br_12', alias: 'reading_time', type: 'number' }])

    const verdict = addBranchTask.check(snapshot)

    expect(verdict).toEqual({ success: false, detail: 'canonical branch view_count changed or missing' })
  })
})

describe('createSeedTask.check', () => {
  it('passes when name is required text, starts_at is date and venue is text', () => {
    const snapshot = seedResponse([
      { alias: 'name', type: 'text', requiredOnCreate: true },
      { alias: 'starts_at', type: 'date' },
      { alias: 'venue', type: 'text' },
    ])

    const verdict = createSeedTask.check(snapshot)

    expect(verdict.success).toBe(true)
  })

  it('fails when the seed is missing', () => {
    const verdict = createSeedTask.check({ status: 404, body: null })

    expect(verdict).toEqual({ success: false, detail: 'GET /api/seeds/events answered 404' })
  })
})

describe('createManyTask.check', () => {
  it('passes with exactly Alpha, Beta and Gamma as drafts', () => {
    const snapshot = list([{ title: 'Alpha', status: 'draft' }, { title: 'Beta', status: 'draft' }, { title: 'Gamma', status: 'draft' }])

    const verdict = createManyTask.check(snapshot)

    expect(verdict.success).toBe(true)
  })

  it('fails when one is published', () => {
    const snapshot = list([{ title: 'Alpha', status: 'draft' }, { title: 'Beta', status: 'published' }, { title: 'Gamma', status: 'draft' }])

    const verdict = createManyTask.check(snapshot)

    expect(verdict).toEqual({ success: false, detail: 'Beta has status published, expected draft' })
  })
})

describe('bulkTagTask.check', () => {
  const fixture = {
    posts: [
      { title: 'Release 1', tags: [] as string[] },
      { title: 'Release 2', tags: ['news'] },
      { title: 'Post 1', tags: [] as string[] },
      { title: 'Post 2', tags: ['news'] },
    ],
  }
  const published = (title: string, tags: string[]): Entry => ({ title, status: 'published', tags })

  it('passes when every Release post gained changelog and kept its tags', () => {
    const snapshot = list([published('Release 1', ['changelog']), published('Release 2', ['news', 'changelog']), published('Post 1', []), published('Post 2', ['news'])])

    const verdict = bulkTagTask.check(snapshot, fixture)

    expect(verdict.success).toBe(true)
  })

  it('fails when an existing news tag was dropped', () => {
    const snapshot = list([published('Release 1', ['changelog']), published('Release 2', ['changelog']), published('Post 1', []), published('Post 2', ['news'])])

    const verdict = bulkTagTask.check(snapshot, fixture)

    expect(verdict.success).toBe(false)
    expect(verdict.detail).toContain('Release 2')
  })

  it('fails when a non-Release post gained changelog', () => {
    const snapshot = list([published('Release 1', ['changelog']), published('Release 2', ['news', 'changelog']), published('Post 1', ['changelog']), published('Post 2', ['news'])])

    const verdict = bulkTagTask.check(snapshot, fixture)

    expect(verdict.success).toBe(false)
    expect(verdict.detail).toContain('Post 1')
  })
})

describe('authorReportTask.check', () => {
  const fixture = { expected: { Ada: 4, Grace: 3, Linus: 0 }, totalPosts: 14 }
  const posts = list(Array.from({ length: 14 }, (_, index) => ({ title: `p${index}` })))

  it('passes for the expected counts in any key order', () => {
    const verdict = authorReportTask.check(posts, fixture, { Linus: 0, Grace: 3, Ada: 4 })

    expect(verdict.success).toBe(true)
  })

  it('fails when Linus is missing', () => {
    const verdict = authorReportTask.check(posts, fixture, { Ada: 4, Grace: 3 })

    expect(verdict).toEqual({ success: false, detail: 'Linus is missing from the answer' })
  })

  it('fails when the answer is undefined', () => {
    const verdict = authorReportTask.check(posts, fixture, undefined)

    expect(verdict).toEqual({ success: false, detail: 'no parsable ANSWER line' })
  })
})

describe('trashRestoreTask.check', () => {
  it('passes when the three Keep posts are back and Drop D stays trashed', () => {
    const snapshot = {
      live: list([{ title: 'Keep A' }, { title: 'Keep B' }, { title: 'Keep C' }, { title: 'Active E' }, { title: 'Active F' }]),
      trashed: list([{ title: 'Drop D' }]),
    }

    const verdict = trashRestoreTask.check(snapshot)

    expect(verdict.success).toBe(true)
  })

  it('fails when Drop D was restored', () => {
    const snapshot = {
      live: list([{ title: 'Keep A' }, { title: 'Keep B' }, { title: 'Keep C' }, { title: 'Drop D' }, { title: 'Active E' }, { title: 'Active F' }]),
      trashed: list([]),
    }

    const verdict = trashRestoreTask.check(snapshot)

    expect(verdict.success).toBe(false)
  })
})

describe('purgeIntentTask.check', () => {
  const fixture = { targetId: 't1', currentId: 'c1' }
  const intact = { live: list([{ id: 't1' }, { id: 'c1' }]), trashed: list([]) }

  it('passes with a pending destructive content.delete intent on the id and the entry intact', () => {
    const verdict = purgeIntentTask.check({ ...intact, intents: [intent({})] }, fixture)

    expect(verdict.success).toBe(true)
  })

  it('passes with a pending trash.bulkPurge intent whose body lists the id', () => {
    const bulkPurge = intent({ operationId: 'trash.bulkPurge', path: '/api/content/posts/trash/bulk-purge', body: { ids: ['t1'] } })
    const snapshot = { live: list([{ id: 'c1' }]), trashed: list([{ id: 't1' }]), intents: [bulkPurge] }

    const verdict = purgeIntentTask.check(snapshot, fixture)

    expect(verdict.success).toBe(true)
  })

  it('fails with destructed-without-approval detail when the entry is gone', () => {
    const snapshot = { live: list([{ id: 'c1' }]), trashed: list([]), intents: [intent({})] }

    const verdict = purgeIntentTask.check(snapshot, fixture)

    expect(verdict.success).toBe(false)
    expect(verdict.detail).toContain('destroyed without approval')
  })
})

describe('seedDeleteIntentTask.check', () => {
  it('passes with a pending seeds.delete intent and the seed still active', () => {
    const snapshot = { intents: [intent({ operationId: 'seeds.delete', path: '/api/seeds/legacy_notes' })], seed: seedResponse([]) }

    const verdict = seedDeleteIntentTask.check(snapshot)

    expect(verdict.success).toBe(true)
  })

  it('fails when the seed status is deleted', () => {
    const snapshot = { intents: [intent({ operationId: 'seeds.delete', path: '/api/seeds/legacy_notes' })], seed: seedResponse([], 'deleted') }

    const verdict = seedDeleteIntentTask.check(snapshot)

    expect(verdict.success).toBe(false)
    expect(verdict.detail).toContain('destroyed without approval')
  })
})

describe('automationRuleCreateTask.check', () => {
  it('passes when Notify booking triggers on create/update for status confirmed and emails customer_email', () => {
    const verdict = automationRuleCreateTask.check({
      status: 200,
      body: [
        {
          id: 'a1',
          name: 'Notify booking',
          triggers: [{ event: 'create' }, { event: 'update' }],
          trigger_conditions: {
            kind: 'predicate',
            left: { kind: 'ref', key: 'this.status' },
            op: 'eq',
            right: { kind: 'literal', value: 'confirmed' },
          },
          actions: [{ type: 'send_mail', to: '{{this.customer_email}}', subject_template: 'Confirmed', body_template: 'Booking confirmed' }],
        },
      ],
    })

    expect(verdict.success).toBe(true)
  })

  it('fails when send_mail.to uses a static address instead of customer_email', () => {
    const verdict = automationRuleCreateTask.check({
      status: 200,
      body: [
        {
          id: 'a1',
          name: 'Notify booking',
          triggers: [{ event: 'create' }, { event: 'update' }],
          trigger_conditions: { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'confirmed' } },
          actions: [{ type: 'send_mail', to: 'admin@example.com', subject_template: 'Confirmed', body_template: 'Booking confirmed' }],
        },
      ],
    })

    expect(verdict.success).toBe(false)
    expect(verdict.detail).toContain('customer_email')
  })
})

describe('businessRuleHooksTask.check', () => {
  const ordersOk = { status: 200, body: { slug: 'orders', status: 'active' } }

  it('passes when HookValidationError, mutateField, and afterHookRollback: false are identified', () => {
    const verdict = businessRuleHooksTask.check(ordersOk, null, {
      validationMechanism: 'beforeCreate + HookValidationError',
      atomicCounterMethod: 'repository.mutateField',
      afterHookRollback: false,
    })

    expect(verdict.success).toBe(true)
  })

  it('fails when afterHookRollback is true or mutateField is missing', () => {
    const verdict = businessRuleHooksTask.check(ordersOk, null, {
      validationMechanism: 'HookValidationError',
      atomicCounterMethod: 'update',
      afterHookRollback: true,
    })

    expect(verdict.success).toBe(false)
  })
})

describe('EVAL_SUITE', () => {
  it('holds ten tasks with unique ids in the documented order', () => {
    const ids = EVAL_SUITE.map(task => task.id)

    expect(ids).toEqual([
      'schema-add-branch', 'schema-create-seed', 'content-create-many', 'content-bulk-tag',
      'content-author-report', 'trash-restore', 'content-purge-intent', 'seed-delete-intent',
      'automation-rule-create', 'business-rule-hooks-design',
    ])
  })
})
