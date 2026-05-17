import { describe, it, expect } from 'vitest'
import type { WhenNode, Seed } from '@beechcms/core'
import { extractPushdownFilters } from '../when-pushdown'

// ---------------------------------------------------------------------------
// Minimal Seed
// ---------------------------------------------------------------------------

function makeSeed(aliases: string[] = []): Seed {
  return {
    slug: 'orders',
    label: 'Orders',
    displayNameAlias: aliases[0] ?? 'id',
    branches: aliases.map((alias) => ({ alias, label: alias, type: 'text' as const })),
  }
}

const seed = makeSeed(['status', 'total', 'name', 'tag'])

// ---------------------------------------------------------------------------
// null / empty
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — null/empty', () => {
  it('null returns []', () => {
    expect(extractPushdownFilters(null, seed)).toEqual([])
  })

  it('empty AND group returns []', () => {
    const node: WhenNode = { kind: 'group', op: 'AND', children: [] }
    expect(extractPushdownFilters(node, seed)).toEqual([])
  })

  it('empty OR group returns []', () => {
    const node: WhenNode = { kind: 'group', op: 'OR', children: [] }
    expect(extractPushdownFilters(node, seed)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Safe single-predicate push-down
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — safe predicates', () => {
  it('root eq predicate is pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'eq',
      right: { kind: 'literal', value: 'paid' },
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe('status')
    expect(result[0].conditions[0].op).toBe('eq')
    expect(result[0].conditions[0].value).toBe('paid')
  })

  it('root neq predicate is pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'neq',
      right: { kind: 'literal', value: 'cancelled' },
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].conditions[0].op).toBe('neq')
  })

  it('root gt predicate is pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.total' },
      op: 'gt',
      right: { kind: 'literal', value: 100 },
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].conditions[0].op).toBe('gt')
  })

  it('root lt predicate is pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.total' },
      op: 'lt',
      right: { kind: 'literal', value: 500 },
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].conditions[0].op).toBe('lt')
  })

  it('root contains predicate is pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.name' },
      op: 'contains',
      right: { kind: 'literal', value: 'Alice' },
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].conditions[0].op).toBe('contains')
  })

  it('root isempty predicate is pushed (no right operand)', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.name' },
      op: 'isempty',
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].conditions[0].op).toBe('is_empty')
  })

  it('root isnotempty predicate is pushed (no right operand)', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.name' },
      op: 'isnotempty',
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].conditions[0].op).toBe('is_not_empty')
  })
})

// ---------------------------------------------------------------------------
// AND group — only direct safe predicate children are pushed
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — AND group', () => {
  it('all safe AND children are pushed', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 100 } },
      ],
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.column)).toContain('status')
    expect(result.map((r) => r.column)).toContain('total')
  })

  it('mixed AND: unsafe children skipped, safe ones pushed', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        // gte is not in PUSHDOWN_OPS → skipped
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gte', right: { kind: 'literal', value: 100 } },
      ],
    }
    const result = extractPushdownFilters(node, seed)
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe('status')
  })
})

// ---------------------------------------------------------------------------
// Unsafe operators stay in-memory
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — unsafe operators stay in-memory', () => {
  for (const op of ['gte', 'lte', 'startswith', 'endswith', 'matches', 'in', 'notin'] as const) {
    it(`${op} is NOT pushed`, () => {
      const node: WhenNode = {
        kind: 'predicate',
        left: { kind: 'ref', key: 'this.status' },
        op,
        right: { kind: 'literal', value: 'x' },
      }
      expect(extractPushdownFilters(node, seed)).toHaveLength(0)
    })
  }
})

// ---------------------------------------------------------------------------
// OR branches stay in-memory
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — OR branches stay in-memory', () => {
  it('OR root group returns []', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'OR',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 100 } },
      ],
    }
    expect(extractPushdownFilters(node, seed)).toHaveLength(0)
  })

  it('AND group with nested OR child: only direct predicate siblings are pushed', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        {
          kind: 'group',
          op: 'OR',
          children: [
            { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 100 } },
            { kind: 'predicate', left: { kind: 'ref', key: 'this.tag' }, op: 'eq', right: { kind: 'literal', value: 'gold' } },
          ],
        },
      ],
    }
    const result = extractPushdownFilters(node, seed)
    // Only the direct 'status' predicate is pushed; the nested OR group is skipped
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe('status')
  })
})

// ---------------------------------------------------------------------------
// Negated group stays in-memory
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — negated AND group stays in-memory', () => {
  it('negated AND root returns []', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      negate: true,
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
      ],
    }
    expect(extractPushdownFilters(node, seed)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Cross-seed refs stay in-memory
// ---------------------------------------------------------------------------

describe('extractPushdownFilters — cross-seed refs stay in-memory', () => {
  it('ref not starting with this. is NOT pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'customers:lastone:status' },
      op: 'eq',
      right: { kind: 'literal', value: 'active' },
    }
    expect(extractPushdownFilters(node, seed)).toHaveLength(0)
  })

  it('right operand is a ref (not literal) → NOT pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'eq',
      right: { kind: 'ref', key: 'customers:lastone:status' },
    }
    expect(extractPushdownFilters(node, seed)).toHaveLength(0)
  })

  it('literal left operand is NOT pushed', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'literal', value: 'paid' },
      op: 'eq',
      right: { kind: 'literal', value: 'paid' },
    }
    expect(extractPushdownFilters(node, seed)).toHaveLength(0)
  })
})

