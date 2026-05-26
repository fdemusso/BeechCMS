// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import type { Automation } from '@beechcms/core'
import { resolveAutomationContext, deriveEntryContext } from '../context-resolver'
import { parseTemplateKey } from '../template-grammar'

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    seed_slug: 'orders',
    name: 'test',
    enabled: true,
    triggers: [{ event: 'cron' as const, cron: '* * * * *' }],
    trigger_conditions: null,
    actions: [],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

describe('resolveAutomationContext', () => {
  const triggerEntry = { id: 'e1', email: 'alice@example.com', product_id: 'p1' }
  const batchEntries = [
    { id: 'e1', total: 10, email: 'alice@example.com' },
    { id: 'e2', total: 20, email: 'bob@example.com' },
    { id: 'e3', total: 30, email: 'carol@example.com' },
  ]

  it('this scope resolves to triggering entry field', async () => {
    const ctx = await resolveAutomationContext(makeAutomation(), triggerEntry, [triggerEntry])
    expect(ctx.lookup(parseTemplateKey('this:email')!)).toBe('alice@example.com')
  })

  it('this. dot notation resolves to triggering entry field', async () => {
    const ctx = await resolveAutomationContext(makeAutomation(), triggerEntry, [triggerEntry])
    expect(ctx.lookup(parseTemplateKey('email')!)).toBe('alice@example.com')
    expect(ctx.lookup(parseTemplateKey('this:product_id')!)).toBe('p1')
  })

  it('batch:all:count matches batchEntries length', async () => {
    const ctx = await resolveAutomationContext(makeAutomation(), triggerEntry, batchEntries)
    expect(ctx.lookup(parseTemplateKey('batch:all:count')!)).toBe(3)
  })

  it('unknown scope → undefined + onMissing fires', async () => {
    const ctx = await resolveAutomationContext(makeAutomation(), triggerEntry, [triggerEntry])
    const missing: string[] = []
    const val = ctx.lookup(parseTemplateKey('unknownseed:lastone:email')!, (f) => missing.push(f))
    expect(val).toBeUndefined()
    expect(missing).toHaveLength(1)
    expect(missing[0]).toBe('unknownseed')
  })

  it('pluck truncates to 100 entries and appends truncation marker', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ email: `u${i}@example.com` }))
    const ctx = await resolveAutomationContext(makeAutomation(), triggerEntry, rows)
    const key = parseTemplateKey('batch:all:pluck:email')!
    const result = ctx.lookup(key) as string
    const values = result.split(', ')
    expect(result.endsWith(' …')).toBe(true)
    expect(values.length).toBe(100)
  })

  it('sum on non-numeric field values returns 0 and fires onMissing for NaN', async () => {
    const ctx = await resolveAutomationContext(
      makeAutomation(),
      triggerEntry,
      [{ id: 'e1', amount: 'not-a-number' }, { id: 'e2', amount: 'also-not' }],
    )
    const missing: string[] = []
    const result = ctx.lookup(parseTemplateKey('batch:all:sum:amount')!, (f) => missing.push(f))
    expect(result).toBe(0)
    expect(missing.length).toBeGreaterThan(0)
  })

  describe('aggregates on batch', () => {
    const rows = [
      { id: 'e1', total: 10 },
      { id: 'e2', total: 20 },
      { id: 'e3', total: 30 },
    ]

    async function makeCtx(batchRows: Record<string, unknown>[]) {
      return resolveAutomationContext(makeAutomation(), batchRows[0] ?? null, batchRows)
    }

    it('count', async () => {
      const ctx = await makeCtx(rows)
      expect(ctx.lookup(parseTemplateKey('batch:all:count')!)).toBe(3)
    })

    it('sum', async () => {
      const ctx = await makeCtx(rows)
      expect(ctx.lookup(parseTemplateKey('batch:all:sum:total')!)).toBe(60)
    })

    it('avg', async () => {
      const ctx = await makeCtx(rows)
      expect(ctx.lookup(parseTemplateKey('batch:all:avg:total')!)).toBe(20)
    })

    it('min', async () => {
      const ctx = await makeCtx(rows)
      expect(ctx.lookup(parseTemplateKey('batch:all:min:total')!)).toBe(10)
    })

    it('max', async () => {
      const ctx = await makeCtx(rows)
      expect(ctx.lookup(parseTemplateKey('batch:all:max:total')!)).toBe(30)
    })
  })
})

describe('deriveEntryContext', () => {
  it('this scope returns new entry, batch scope delegates to base', async () => {
    const batchRows = [{ id: 'e1', val: 1 }, { id: 'e2', val: 2 }]
    const base = await resolveAutomationContext(makeAutomation(), batchRows[0] ?? null, batchRows)
    const derived = deriveEntryContext(base, { id: 'e2', val: 2, email: 'derived@example.com' })
    expect(derived.lookup(parseTemplateKey('this:email')!)).toBe('derived@example.com')
    expect(derived.lookup(parseTemplateKey('batch:all:count')!)).toBe(2)
  })
})
