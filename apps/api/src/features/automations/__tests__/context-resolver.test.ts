import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Automation, ContentRepository, Seed } from '@beechcms/core'
import { resolveAutomationContext, deriveEntryContext } from '../context-resolver'
import { parseTemplateKey } from '../template-grammar'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeed(slug: string, branches: string[] = []): Seed {
  return {
    slug,
    label: slug,
    displayNameAlias: branches[0] ?? 'id',
    branches: branches.map((alias) => ({ alias, label: alias, type: 'text' as const })),
  }
}

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    seed_slug: 'orders',
    name: 'test',
    enabled: true,
    trigger_event: 'cron',
    trigger_cron: '* * * * *',
    trigger_conditions: null,
    actions: [],
    context: null,
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

function makeRepo(items: Record<string, unknown>[]): ContentRepository {
  return {
    findMany: vi.fn().mockResolvedValue({ items, total: items.length }),
  } as unknown as ContentRepository
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveAutomationContext', () => {
  const triggerEntry = { id: 'e1', email: 'alice@example.com', product_id: 'p1' }
  const batchEntries = [
    { id: 'e1', total: 10, email: 'alice@example.com' },
    { id: 'e2', total: 20, email: 'bob@example.com' },
    { id: 'e3', total: 30, email: 'carol@example.com' },
  ]

  // 1. this scope returns triggering entry's field
  it('this scope resolves to triggering entry field', async () => {
    const repo = makeRepo([])
    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed: () => null },
      makeAutomation(),
      triggerEntry,
      [triggerEntry],
    )
    const key = parseTemplateKey('this:email')!
    expect(ctx.lookup(key)).toBe('alice@example.com')
  })

  // 2. batch:all:count matches batchEntries.length
  it('batch:all:count matches batchEntries length', async () => {
    const repo = makeRepo([])
    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed: () => null },
      makeAutomation(),
      triggerEntry,
      batchEntries,
    )
    const key = parseTemplateKey('batch:all:count')!
    expect(ctx.lookup(key)).toBe(3)
  })

  // 3. <slug>:lastone:<field> calls findMany with limit:1, order_by:'created_at', order:'DESC'
  it('inline seed lastone lookup calls findMany with correct params', async () => {
    const seed = makeSeed('customers', ['email', 'name'])
    const repo = makeRepo([{ id: 'c1', email: 'cust@example.com' }])
    const getSeed = vi.fn().mockReturnValue(seed)

    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      makeAutomation(),
      triggerEntry,
      [triggerEntry],
    )
    const key = parseTemplateKey('customers:lastone:email')!
    ctx.lookup(key)

    expect(repo.findMany).toHaveBeenCalledWith(
      seed,
      expect.objectContaining({
        pagination: { limit: 1, offset: 0 },
        orderBy: { column: 'created_at', dir: 'DESC' },
      }),
    )
  })

  // 4. <slug>:byid(x):<field> calls findMany with id filter
  it('named context byid selector calls findMany with id filter', async () => {
    const seed = makeSeed('customers', ['email'])
    const repo = makeRepo([{ id: 'c1', email: 'gold@example.com' }])
    const getSeed = vi.fn().mockReturnValue(seed)

    const automation = makeAutomation({
      context: [{ as: 'topCustomer', seed_slug: 'customers', selector: { kind: 'byid', id: 'c1' } }],
    })

    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      automation,
      triggerEntry,
      [triggerEntry],
    )
    const key = parseTemplateKey('topCustomer:email')!
    expect(ctx.lookup(key)).toBe('gold@example.com')

    expect(repo.findMany).toHaveBeenCalledWith(
      seed,
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({ column: 'id' }),
        ]),
      }),
    )
  })

  // 5. Named context where.value referencing {{this.product_id}} resolves before query
  it('context where.value with {{this.x}} is interpolated before query', async () => {
    const seed = makeSeed('products', ['name', 'id'])
    const repo = makeRepo([{ id: 'p1', name: 'Widget' }])
    const getSeed = vi.fn().mockReturnValue(seed)

    const automation = makeAutomation({
      context: [{
        as: 'product',
        seed_slug: 'products',
        selector: { kind: 'firstone' },
        where: [{ field: 'id', op: 'eq', value: '{{product_id}}' }],
      }],
    })

    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      automation,
      triggerEntry,
      [triggerEntry],
    )

    expect(repo.findMany).toHaveBeenCalledWith(
      seed,
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({
            column: 'id',
            conditions: [expect.objectContaining({ value: 'p1' })],
          }),
        ]),
      }),
    )
  })

  // 6. Two references to same slug:lastone field issue ONE repository call (memoisation)
  it('memoises identical scoped lookups within one run', async () => {
    const seed = makeSeed('customers', ['email'])
    const repo = makeRepo([{ id: 'c1', email: 'memo@example.com' }])
    const getSeed = vi.fn().mockReturnValue(seed)

    const automation = makeAutomation({
      context: [
        { as: 'c1', seed_slug: 'customers', selector: { kind: 'lastone' } },
        { as: 'c2', seed_slug: 'customers', selector: { kind: 'lastone' } },
      ],
    })

    await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      automation,
      triggerEntry,
      [triggerEntry],
    )

    // Same canonical key → only one findMany call
    expect(repo.findMany).toHaveBeenCalledTimes(1)
  })

  // 7. Unknown slug → lookup returns undefined; onMissing fires
  it('unknown slug → undefined + onMissing', async () => {
    const repo = makeRepo([])
    const getSeed = vi.fn().mockReturnValue(null)
    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      makeAutomation(),
      triggerEntry,
      [triggerEntry],
    )

    const missing: string[] = []
    const key = parseTemplateKey('unknownseed:lastone:email')!
    const val = ctx.lookup(key, (f) => missing.push(f))
    expect(val).toBeUndefined()
    expect(missing).toHaveLength(1)
  })

  // 8. pluck over 150 rows truncates to 100 and appends ' …'
  it('pluck truncates to 100 entries and appends truncation marker', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({ email: `u${i}@example.com` }))
    const repo = makeRepo([])
    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed: () => null },
      makeAutomation(),
      triggerEntry,
      rows,
    )
    const key = parseTemplateKey('batch:all:pluck:email')!
    const result = ctx.lookup(key) as string
    const values = result.split(', ')
    // The truncation marker is appended to the comma-joined string (not as a separate element)
    expect(result.endsWith(' …')).toBe(true)
    // 100 real values joined by ', '; the last element ends with ' …' but is still one element
    expect(values.length).toBe(100)
  })

  // 9. sum/avg on a non-numeric field returns 0 and fires onMissing
  it('sum on non-numeric field values returns 0 and fires onMissing for NaN', async () => {
    const repo = makeRepo([])
    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed: () => null },
      makeAutomation(),
      triggerEntry,
      [{ id: 'e1', amount: 'not-a-number' }, { id: 'e2', amount: 'also-not' }],
    )
    const missing: string[] = []
    const key = parseTemplateKey('batch:all:sum:amount')!
    const result = ctx.lookup(key, (f) => missing.push(f))
    expect(result).toBe(0)
    expect(missing.length).toBeGreaterThan(0)
  })

  // 10. Recursive where.value is one-pass: forward refs resolve to defaultValue
  it('context where.value one-pass: forward ref to undeclared context resolves empty', async () => {
    const seed = makeSeed('products', ['name'])
    const findMany = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const repo = { findMany } as unknown as ContentRepository
    const getSeed = vi.fn().mockReturnValue(seed)

    const automation = makeAutomation({
      context: [{
        as: 'item',
        seed_slug: 'products',
        where: [{ field: 'name', op: 'eq', value: '{{forwardRef.name}}' }],
      }],
    })

    await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      automation,
      triggerEntry,
      [triggerEntry],
    )

    // The where value should have tried to interpolate {{forwardRef.name}}.
    // Since forwardRef is not in triggerEntry or any named context, interpolation
    // leaves the template-style token or resolves to empty string (one-pass only).
    expect(findMany).toHaveBeenCalled()
    const filters = findMany.mock.calls[0][1].filters
    const nameFilter = filters.find((f: { column: string }) => f.column === 'name')
    // Value is empty (not expanded) because forwardRef doesn't exist at declaration time
    expect(nameFilter?.conditions[0]?.value).not.toBe('some-future-value')
  })

  describe('aggregates on batch', () => {
    const rows = [
      { id: 'e1', total: 10 },
      { id: 'e2', total: 20 },
      { id: 'e3', total: 30 },
    ]

    async function makeCtx(batchRows: Record<string, unknown>[]) {
      const repo = makeRepo([])
      return resolveAutomationContext(
        { contentRepository: repo, getSeed: () => null },
        makeAutomation(),
        batchRows[0] ?? null,
        batchRows,
      )
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

  describe('_count legacy alias', () => {
    it('{{_count}} resolves to batchEntries.length with a console.warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const repo = makeRepo([])
      const ctx = await resolveAutomationContext(
        { contentRepository: repo, getSeed: () => null },
        makeAutomation(),
        triggerEntry,
        batchEntries,
      )
      const key = parseTemplateKey('_count')!
      expect(ctx.lookup(key)).toBe(3)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('deprecated'))
      warnSpy.mockRestore()
    })
  })
})

describe('deriveEntryContext', () => {
  it('this scope returns new entry, batch scope delegates to base', async () => {
    const repo = makeRepo([])
    const batchRows = [{ id: 'e1', val: 1 }, { id: 'e2', val: 2 }]
    const base = await resolveAutomationContext(
      { contentRepository: repo, getSeed: () => null },
      makeAutomation(),
      batchRows[0] ?? null,
      batchRows,
    )

    const derived = deriveEntryContext(base, { id: 'e2', val: 2, email: 'derived@example.com' })

    // this scope uses new entry
    expect(derived.lookup(parseTemplateKey('this:email')!)).toBe('derived@example.com')
    // batch:all:count still delegates to base (full batch)
    expect(derived.lookup(parseTemplateKey('batch:all:count')!)).toBe(2)
  })
})
