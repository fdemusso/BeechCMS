// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { D1AutomationRepository } from './automations.repository.d1'

function makeDb() {
  const calls: { sql: string; bindings: unknown[] }[] = []
  let nextAllResult: unknown[] = []
  let nextFirstResult: unknown = null

  const db = {
    _calls: calls,
    _setAllResult(rows: unknown[]) { nextAllResult = rows },
    _setFirstResult(row: unknown) { nextFirstResult = row },
    prepare(sql: string) {
      let boundValues: unknown[] = []
      const stmt = {
        bind(...args: unknown[]) { boundValues = args; return stmt },
        async run() {
          calls.push({ sql, bindings: boundValues })
          return { success: true }
        },
        async all() {
          calls.push({ sql, bindings: boundValues })
          return { results: nextAllResult }
        },
        async first() {
          calls.push({ sql, bindings: boundValues })
          return nextFirstResult
        },
      }
      return stmt
    },
  }
  return db as unknown as D1Database & typeof db
}

const fixtureRow = {
  id: 'abc',
  seed_slug: 'posts',
  name: 'test',
  enabled: 1,
  triggers: JSON.stringify([{ event: 'create' }]),
  trigger_conditions: null,
  actions: JSON.stringify([{ type: 'webhook', url: 'https://example.com' }]),
  created_at: 1000,
  updated_at: 1000,
}

describe('D1AutomationRepository.create', () => {
  it('serialises actions and trigger_conditions to JSON', async () => {
    const db = makeDb()
    const repo = new D1AutomationRepository(db)
    const whenNode = {
      kind: 'group' as const,
      op: 'AND' as const,
      children: [{ kind: 'predicate' as const, left: { kind: 'ref' as const, key: 'this.status' }, op: 'eq' as const, right: { kind: 'literal' as const, value: 'published' } }],
    }
    await repo.create({
      seed_slug: 'posts',
      name: 'test',
      triggers: [{ event: 'create' }],
      trigger_conditions: whenNode,
      actions: [{ type: 'webhook', url: 'https://example.com' }],
    })
    expect(db._calls).toHaveLength(1)
    const { bindings } = db._calls[0]
    // triggers is index 3, trigger_conditions is index 4, actions is index 5
    expect(typeof bindings[3]).toBe('string')
    expect(JSON.parse(bindings[3] as string)).toEqual([{ event: 'create' }])
    expect(typeof bindings[4]).toBe('string')
    expect(JSON.parse(bindings[4] as string)).toEqual(whenNode)
    expect(typeof bindings[5]).toBe('string')
    expect(JSON.parse(bindings[5] as string)).toEqual([{ type: 'webhook', url: 'https://example.com' }])
  })

  it('stores null for missing trigger_conditions', async () => {
    const db = makeDb()
    const repo = new D1AutomationRepository(db)
    await repo.create({
      seed_slug: 'posts',
      name: 'test',
      triggers: [{ event: 'create' }],
      trigger_conditions: null,
      actions: [{ type: 'webhook', url: 'https://example.com' }],
    })
    const { bindings } = db._calls[0]
    expect(bindings[4]).toBeNull()
  })
})

describe('D1AutomationRepository.update', () => {
  it('builds SET clause only from provided keys', async () => {
    const db = makeDb()
    const repo = new D1AutomationRepository(db)
    await repo.update('abc', { name: 'renamed' })
    expect(db._calls).toHaveLength(1)
    expect(db._calls[0].sql).toContain('name = ?')
    expect(db._calls[0].sql).not.toContain('seed_slug')
  })

  it('short-circuits when no fields provided', async () => {
    const db = makeDb()
    const repo = new D1AutomationRepository(db)
    await repo.update('abc', {})
    expect(db._calls).toHaveLength(0)
  })
})

describe('D1AutomationRepository.toggle', () => {
  it('only writes enabled and updated_at', async () => {
    const db = makeDb()
    const repo = new D1AutomationRepository(db)
    await repo.toggle('abc', false)
    expect(db._calls).toHaveLength(1)
    const { sql, bindings } = db._calls[0]
    expect(sql).toBe('UPDATE automations SET enabled = ?, updated_at = ? WHERE id = ?')
    expect(bindings[0]).toBe(0)
    expect(bindings[2]).toBe('abc')
  })
})

describe('rowToAutomation JSON round-trip', () => {
  it('deserialises trigger_conditions as null when column is null', async () => {
    const db = makeDb()
    db._setAllResult([fixtureRow])
    const repo = new D1AutomationRepository(db)
    const rows = await repo.list('posts')
    expect(rows[0].trigger_conditions).toBeNull()
  })

  it('deserialises trigger_conditions as WhenNode when column contains WhenNode JSON', async () => {
    const db = makeDb()
    const whenNode = {
      kind: 'group',
      op: 'AND',
      children: [{
        kind: 'predicate',
        left: { kind: 'ref', key: 'this.status' },
        op: 'eq',
        right: { kind: 'literal', value: 'published' },
      }],
    }
    const rowWithConditions = {
      ...fixtureRow,
      trigger_conditions: JSON.stringify(whenNode),
    }
    db._setAllResult([rowWithConditions])
    const repo = new D1AutomationRepository(db)
    const rows = await repo.list('posts')
    expect(rows[0].trigger_conditions).toEqual(whenNode)
  })

  it('deserialises actions as parsed array', async () => {
    const db = makeDb()
    db._setAllResult([fixtureRow])
    const repo = new D1AutomationRepository(db)
    const rows = await repo.list('posts')
    expect(rows[0].actions).toEqual([{ type: 'webhook', url: 'https://example.com' }])
  })
})
