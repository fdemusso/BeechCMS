// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { executeSetVariable } from '../action-executors/set-variable.executor'
import { resolveAutomationContext } from '../context-resolver'
import { resolveVarAccess } from '../var-access-resolver'
import { parseTemplateKey } from '../template-grammar'
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

async function makeCtx(overrides: Partial<{
  entry: Record<string, unknown>
  variables: Record<string, unknown>
  repository: ContentRepository
  getSeed: (slug: string) => Seed | null
  seed: Seed
}> = {}) {
  const entry = overrides.entry ?? { id: 'entry-1', customer_id: 'cust-42' }
  const variables = overrides.variables ?? {}
  const baseContext = await resolveAutomationContext({} as any, entry, [entry])
  const context = {
    triggerEntry: baseContext.triggerEntry,
    lookup(parsed: any, onMissing?: any) {
      if (parsed.kind === 'simple') {
        const varVal = (variables as any)[parsed.path]
        if (varVal !== undefined) return varVal
        if (parsed.path.includes('.')) {
          const [first, ...rest] = parsed.path.split('.')
          const varRoot = (variables as any)[first]
          if (varRoot !== undefined) {
            let cur: any = varRoot
            for (const k of rest) cur = cur?.[k]
            if (cur !== undefined) return cur
          }
        }
      } else if (parsed.kind === 'var_access') {
        return resolveVarAccess(parsed, variables, onMissing)
      }
      return baseContext.lookup(parsed, onMissing)
    },
  }
  return {
    entry,
    variables,
    repository: overrides.repository ?? {
      findMany: vi.fn().mockResolvedValue({ items: [] }),
    } as unknown as ContentRepository,
    getSeed: overrides.getSeed ?? vi.fn().mockReturnValue(MOCK_SEED),
    seed: overrides.seed ?? MOCK_SEED,
    context,
  }
}

describe('fixed_id mode', () => {
  it('1 — fixed_id set, record exists → variables[name] equals item', async () => {
    const item = { id: 'c_1', name: 'Mario', email: 'mario@x.com', total: 99 }
    const findMany = vi.fn().mockResolvedValue({ items: [item] })
    const ctx = await makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', fixed_id: 'c_1' },
      ctx,
    )

    expect(ctx.variables.cliente).toEqual(item)
    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters[0].conditions[0].value).toBe('c_1')
    expect(opts.pagination.limit).toBe(1)
  })

  it('2 — fixed_id set, record missing → null + console.warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items: [] }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', fixed_id: 'ghost' },
      ctx,
    )

    expect(ctx.variables.cliente).toBeNull()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('3 — fixed_id + column → { _value: item[column] }', async () => {
    const item = { id: 'c_1', name: 'Mario', email: 'mario@x.com', total: 99 }
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items: [item] }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', fixed_id: 'c_1', column: 'email' },
      ctx,
    )

    expect(ctx.variables.cliente).toEqual({ _value: 'mario@x.com' })
  })

  it('4 — fixed_id interpolation from this scope (dot notation)', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = await makeCtx({
      entry: { id: 'e1', customer_id: 'cust-77' },
      repository: { findMany } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'cliente', seed_slug: 'clienti', fixed_id: '{{this.customer_id}}' },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters[0].conditions[0].value).toBe('cust-77')
  })
})

describe('collection mode', () => {
  it('5 — no filters: count, firstone, lastone, sum, pluck correct', async () => {
    const items = [
      { id: '1', name: 'A', email: 'a@x.com', total: 10, created_at: 1000 },
      { id: '2', name: 'B', email: 'b@x.com', total: 20, created_at: 2000 },
      { id: '3', name: 'C', email: 'c@x.com', total: 30, created_at: 500 },
    ]
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'ordini', seed_slug: 'clienti' },
      ctx,
    )

    const result = ctx.variables.ordini as any
    expect(result.count).toBe(3)
    expect(result.sum.total).toBe(60)
    expect(result.firstone).toEqual(items[2])
    expect(result.lastone).toEqual(items[1])
    expect(result.pluck.name).toBe('A, B, C')
  })

  it('6 — collection with filters → findMany receives resolved filter groups', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = await makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'ordini',
        seed_slug: 'clienti',
        filters: [{ field: 'name', op: 'eq', value: 'Mario' }],
      },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters).toHaveLength(1)
    expect(opts.filters[0].column).toBe('name')
  })

  it('7 — collection with column pin: scalar aggregates + count non-null', async () => {
    const items = [
      { id: '1', total: 10, created_at: 1 },
      { id: '2', total: null, created_at: 2 },
      { id: '3', total: 20, created_at: 3 },
    ]
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'r', seed_slug: 'clienti', column: 'total' },
      ctx,
    )

    const result = ctx.variables.r as any
    expect(result.count).toBe(2)
    expect(result.sum).toBe(30)
    expect(result.avg).toBe(15)
    expect(result.min).toBe(10)
    expect(result.max).toBe(20)
  })

  it('8 — seed_slug omitted → uses ctx.seed.slug', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const triggerSeed: Seed = { ...MOCK_SEED, slug: 'ordini' }
    const ctx = await makeCtx({
      repository: { findMany } as unknown as ContentRepository,
      getSeed: vi.fn().mockReturnValue(triggerSeed),
      seed: triggerSeed,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'result' },
      ctx,
    )

    const [seed] = findMany.mock.calls[0]
    expect(seed.slug).toBe('ordini')
  })

  it('9 — seed not found → null + warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ctx = await makeCtx({ getSeed: vi.fn().mockReturnValue(null) })

    await executeSetVariable(
      { type: 'set_variable', name: 'x', seed_slug: 'ghost' },
      ctx,
    )

    expect(ctx.variables.x).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ghost'))
  })

  it('10 — filter value interpolated from a previously set variable', async () => {
    const findMany = vi.fn().mockResolvedValue({ items: [] })
    const ctx = await makeCtx({
      variables: { cliente: { id: 'cust-123' } } as Record<string, unknown>,
      repository: { findMany } as unknown as ContentRepository,
    })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'ordini',
        seed_slug: 'clienti',
        filters: [{ field: 'customer_id', op: 'eq', value: '{{cliente.id}}' }],
      },
      ctx,
    )

    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters[0].conditions[0].value).toBe('cust-123')
  })

  it('12 — date branch: sum/avg/min/max computed from ISO strings', async () => {
    const dateSeed: Seed = {
      ...MOCK_SEED,
      branches: [
        { alias: 'publishedAt', label: 'Published', type: 'date', id: 'br_d1' },
      ],
    } as unknown as Seed
    const items = [
      { id: '1', publishedAt: '2025-01-10T00:00:00.000Z', created_at: 1 },
      { id: '2', publishedAt: '2025-03-05T00:00:00.000Z', created_at: 2 },
      { id: '3', publishedAt: '2025-06-01T00:00:00.000Z', created_at: 3 },
    ]
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
      getSeed: vi.fn().mockReturnValue(dateSeed),
      seed: dateSeed,
    })

    await executeSetVariable({ type: 'set_variable', name: 'articoli', seed_slug: 'clienti' }, ctx)

    const result = ctx.variables.articoli as any
    expect(result.sum.publishedAt).toBeGreaterThan(0)
    expect(result.avg.publishedAt).toBeGreaterThan(0)
    expect(result.min.publishedAt).toBeLessThan(result.max.publishedAt)
    const minDate = new Date('2025-01-10T00:00:00.000Z').getTime() / 1000
    const maxDate = new Date('2025-06-01T00:00:00.000Z').getTime() / 1000
    expect(result.min.publishedAt).toBe(minDate)
    expect(result.max.publishedAt).toBe(maxDate)
  })

  it('13 — var_access inline condition on ISO date field', async () => {
    const items = [
      { id: '1', publishedAt: '2025-01-10T00:00:00.000Z', created_at: 1 },
      { id: '2', publishedAt: '2025-03-05T00:00:00.000Z', created_at: 2 },
      { id: '3', publishedAt: '2026-06-01T00:00:00.000Z', created_at: 3 },
    ]
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
    })
    await executeSetVariable({ type: 'set_variable', name: 'arts', seed_slug: 'clienti' }, ctx)

    const parsed = parseTemplateKey('arts.(publishedAt>1740000000).count')
    expect(parsed?.kind).toBe('var_access')
    const result = ctx.context.lookup(parsed!)
    // 1740000000 = ~2025-02-20; art-0002 (Mar 2025) and art-0003 (Jun 2026) qualify
    expect(result).toBe(2)
  })

  it('11 — _items is non-enumerable (not in JSON.stringify)', async () => {
    const items = [{ id: '1', name: 'A', email: 'a@x.com', total: 5, created_at: 1 }]
    const ctx = await makeCtx({
      repository: { findMany: vi.fn().mockResolvedValue({ items }) } as unknown as ContentRepository,
    })

    await executeSetVariable(
      { type: 'set_variable', name: 'ordini', seed_slug: 'clienti' },
      ctx,
    )

    const json = JSON.stringify(ctx.variables)
    expect(json).not.toContain('_items')
    const result = ctx.variables.ordini as any
    expect(result._items).toEqual(items)
  })
})

// ── Sprint 07: backward-compatibility with legacy load_type field ──────────────

describe('legacy load_type backward compatibility', () => {
  it('L1 — load_type: fruit + single id-eq filter → upgraded to fixed_id path', async () => {
    const item = { id: 'c_1', name: 'Mario', email: 'mario@x.com', total: 99 }
    const findMany = vi.fn().mockResolvedValue({ items: [item] })
    const ctx = await makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'cliente',
        seed_slug: 'clienti',
        load_type: 'fruit',
        filters: [{ field: 'id', op: 'eq', value: 'c_1' }],
      } as any,
      ctx,
    )

    // Should use fixed_id path: pagination.limit = 1, filter on id column
    const [, opts] = findMany.mock.calls[0]
    expect(opts.filters[0].column).toBe('id')
    expect(opts.filters[0].conditions[0].value).toBe('c_1')
    expect(opts.pagination.limit).toBe(1)
    expect(ctx.variables.cliente).toEqual(item)
  })

  it('L2 — load_type: fruit + non-id filter → collection path (degraded)', async () => {
    const items = [{ id: '1', name: 'Mario', email: 'mario@x.com', total: 10, created_at: 1 }]
    const findMany = vi.fn().mockResolvedValue({ items })
    const ctx = await makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'clienti',
        seed_slug: 'clienti',
        load_type: 'fruit',
        filters: [{ field: 'name', op: 'eq', value: 'Mario' }],
      } as any,
      ctx,
    )

    // Non-id filter: falls through to collection path
    const result = ctx.variables.clienti as any
    expect(result.count).toBe(1)
  })

  it('L3 — load_type: branch → collection path', async () => {
    const items = [
      { id: '1', name: 'A', email: 'a@x.com', total: 10, created_at: 1 },
      { id: '2', name: 'B', email: 'b@x.com', total: 20, created_at: 2 },
    ]
    const findMany = vi.fn().mockResolvedValue({ items })
    const ctx = await makeCtx({ repository: { findMany } as unknown as ContentRepository })

    await executeSetVariable(
      {
        type: 'set_variable',
        name: 'ordini',
        seed_slug: 'clienti',
        load_type: 'branch',
      } as any,
      ctx,
    )

    const result = ctx.variables.ordini as any
    expect(result.count).toBe(2)
    expect(result.sum).toBeDefined()
    expect(result.pluck).toBeDefined()
  })
})
