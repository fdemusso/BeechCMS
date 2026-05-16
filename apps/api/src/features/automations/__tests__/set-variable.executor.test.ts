import { describe, it, expect, vi } from 'vitest'
import { executeSetVariable } from '../action-executors/set-variable.executor'
import type { ContentRepository, Seed } from '@beechcms/core'

const MOCK_SEED: Seed = {
  slug: 'clienti',
  label: 'Clienti',
  branches: [
    { alias: 'name',  label: 'Name',  type: 'text',   id: 'br_01' },
    { alias: 'email', label: 'Email', type: 'text',   id: 'br_02' },
    { alias: 'total', label: 'Total', type: 'number', id: 'br_03' },
  ],
} as unknown as Seed

function makeCtx(overrides: Partial<{
  entry: Record<string, unknown>
  variables: Record<string, unknown>
  repository: ContentRepository
  getSeed: (slug: string) => Seed | null
}> = {}) {
  return {
    entry: { id: 'entry-1', customer_id: 'cust-42' } as Record<string, unknown>,
    variables: {} as Record<string, unknown>,
    repository: {
      findMany: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ContentRepository,
    getSeed: vi.fn().mockReturnValue(MOCK_SEED),
    ...overrides,
  }
}

// ── fruit ─────────────────────────────────────────────────────────────────────

describe('load_type: fruit', () => {
  it('sets variable to the first item when found', async () => {
    const item = { id: 'cust-42', name: 'Mario Rossi', email: 'mario@example.com' }
    const ctx = makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items: [item] }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', load_type: 'fruit', filters: [] },
      ctx,
    )

    expect(ctx.variables.cliente).toEqual(item)
  })

  it('sets variable to null when no items found', async () => {
    const ctx = makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items: [] }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', load_type: 'fruit', filters: [] },
      ctx,
    )

    expect(ctx.variables.cliente).toBeNull()
  })

  it('requests limit:1 for fruit', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', load_type: 'fruit', filters: [] },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.pagination.limit).toBe(1)
  })

  it('interpolates filter value from this scope', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = makeCtx({
      entry: { id: 'e1', customer_id: 'cust-99' },
      repository: { findMany } as unknown as ContentRepository,
    })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'cliente',
        seed_slug: 'clienti',
        load_type: 'fruit',
        filters: [{ field: 'id', op: 'eq', value: '{{this.customer_id}}' }],
      },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters[0].conditions[0].value).toBe('cust-99')
  })

  it('interpolates filter value from a previously set variable', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = makeCtx({
      variables: { cliente: { id: 'cust-123' } } as Record<string, unknown>,
      repository: { findMany } as unknown as ContentRepository,
    })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'ordini',
        seed_slug: 'clienti',
        load_type: 'fruit',
        filters: [{ field: 'customer_id', op: 'eq', value: '{{cliente.id}}' }],
      },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters[0].conditions[0].value).toBe('cust-123')
  })
})

// ── branch ────────────────────────────────────────────────────────────────────

describe('load_type: branch', () => {
  it('computes count, sum, avg, pluck aggregates', async () => {
    const items = [
      { id: '1', name: 'Order A', email: 'a@x.com', total: 100 },
      { id: '2', name: 'Order B', email: 'b@x.com', total: 200 },
      { id: '3', name: 'Order C', email: 'c@x.com', total: 50 },
    ]
    const ctx = makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'ordini', seed_slug: 'clienti', load_type: 'branch', filters: [] },
      ctx,
    )

    const result = ctx.variables.ordini as any
    expect(result.count).toBe(3)
    expect(result.sum.total).toBe(350)
    expect(result.avg.total).toBeCloseTo(116.67, 1)
    expect(result.pluck.name).toBe('Order A, Order B, Order C')
    expect(result.pluck.email).toBe('a@x.com, b@x.com, c@x.com')
  })

  it('returns count:0 and empty maps when no items', async () => {
    const ctx = makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items: [] }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'ordini', seed_slug: 'clienti', load_type: 'branch', filters: [] },
      ctx,
    )

    const result = ctx.variables.ordini as any
    expect(result.count).toBe(0)
    expect(result.sum.total).toBe(0)
    expect(result.avg.total).toBe(0)
    expect(result.pluck.name).toBe('')
  })

  it('requests limit:1000 for branch', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      { type: 'set_variable', name: 'ordini', seed_slug: 'clienti', load_type: 'branch', filters: [] },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.pagination.limit).toBe(1000)
  })

  it('skips NaN values when computing sum', async () => {
    const items = [
      { id: '1', total: 100 },
      { id: '2', total: 'not-a-number' },
      { id: '3', total: 50 },
    ]
    const ctx = makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'r', seed_slug: 'clienti', load_type: 'branch', filters: [] },
      ctx,
    )

    const result = ctx.variables.r as any
    expect(result.sum.total).toBe(150)
  })
})

// ── missing seed ──────────────────────────────────────────────────────────────

describe('missing seed', () => {
  it('sets null for fruit and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = makeCtx({ getSeed: vi.fn().mockReturnValue(null) })

    await executeSetVariable(
      { type: 'set_variable', name: 'missing', seed_slug: 'nonexistent', load_type: 'fruit', filters: [] },
      ctx,
    )

    expect(ctx.variables.missing).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('nonexistent'))
  })

  it('sets empty branch summary for branch and logs a warning', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = makeCtx({ getSeed: vi.fn().mockReturnValue(null) })

    await executeSetVariable(
      { type: 'set_variable', name: 'missing', seed_slug: 'nonexistent', load_type: 'branch', filters: [] },
      ctx,
    )

    const result = ctx.variables.missing as any
    expect(result.count).toBe(0)
    expect(result.sum).toEqual({})
    expect(result.avg).toEqual({})
    expect(result.pluck).toEqual({})
  })
})
