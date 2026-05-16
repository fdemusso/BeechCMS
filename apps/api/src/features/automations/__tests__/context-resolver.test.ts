import { describe, it, expect, vi } from 'vitest'
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
    triggers: [{ event: 'cron' as const, cron: '* * * * *' }],
    trigger_conditions: null,
    actions: [],
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

  // 3. Inline seed lastone lookup: registers a findMany call (memoised)
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

  // 4. Inline byid lookup: registers findMany with id filter
  it('inline byid lookup calls findMany with id filter', async () => {
    const seed = makeSeed('customers', ['email'])
    const repo = makeRepo([{ id: 'c1', email: 'gold@example.com' }])
    const getSeed = vi.fn().mockReturnValue(seed)

    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      makeAutomation(),
      triggerEntry,
      [triggerEntry],
    )
    const key = parseTemplateKey('customers:byid(c1):email')!
    ctx.lookup(key)

    expect(repo.findMany).toHaveBeenCalledWith(
      seed,
      expect.objectContaining({
        filters: expect.arrayContaining([
          expect.objectContaining({ column: 'id' }),
        ]),
      }),
    )
  })

  // 5. Variables injected via withVariables wrapper are accessible as simple dot-paths
  it('withVariables wrapper exposes set_variable results as simple dot-paths', async () => {
    const repo = makeRepo([])
    const baseCtx = await resolveAutomationContext(
      { contentRepository: repo, getSeed: () => null },
      makeAutomation(),
      triggerEntry,
      [triggerEntry],
    )

    // Simulate what withVariables does in the runner
    const variables = { cliente: { email: 'vip@example.com', name: 'VIP' } }
    const extCtx = {
      triggerEntry: baseCtx.triggerEntry,
      lookup(parsed: ReturnType<typeof parseTemplateKey>, onMissing?: (f: string) => void) {
        if (parsed && parsed.kind === 'simple') {
          const parts = parsed.path.split('.')
          let cur: unknown = variables
          for (const p of parts) {
            cur = (cur as Record<string, unknown>)?.[p]
          }
          if (cur !== undefined) return cur
        }
        return baseCtx.lookup(parsed!, onMissing)
      },
    }

    const emailKey = parseTemplateKey('cliente.email')!
    expect(extCtx.lookup(emailKey)).toBe('vip@example.com')
  })

  // 6. Memoisation: two inline lookups to same slug:lastone issue ONE findMany call
  it('memoises identical inline scoped lookups within one run', async () => {
    const seed = makeSeed('customers', ['email'])
    const repo = makeRepo([{ id: 'c1', email: 'memo@example.com' }])
    const getSeed = vi.fn().mockReturnValue(seed)

    const ctx = await resolveAutomationContext(
      { contentRepository: repo, getSeed },
      makeAutomation(),
      triggerEntry,
      [triggerEntry],
    )

    const key = parseTemplateKey('customers:lastone:email')!
    ctx.lookup(key)
    ctx.lookup(key)

    // memoFetch deduplicates: only one findMany issued
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
    expect(result.endsWith(' …')).toBe(true)
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

  // 10. _count legacy alias
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

    expect(derived.lookup(parseTemplateKey('this:email')!)).toBe('derived@example.com')
    expect(derived.lookup(parseTemplateKey('batch:all:count')!)).toBe(2)
  })
})
