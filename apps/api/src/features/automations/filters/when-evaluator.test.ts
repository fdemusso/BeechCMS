// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import type { WhenNode } from '@beechcms/core'
import { evaluateWhen } from './when-evaluator'
import type { ResolvedContext } from '../evaluator/context-resolver'
import { parseTemplateKey } from '../evaluator/template-grammar'

// ---------------------------------------------------------------------------
// Minimal ResolvedContext builder for testing
// ---------------------------------------------------------------------------

function makeContext(entry: Record<string, unknown>): ResolvedContext {
  return {
    triggerEntry: entry,
    lookup(parsed, onMissing) {
      if (!parsed) return undefined
      if (parsed.kind === 'simple') {
        const parts = parsed.path.split('.')
        let cur: unknown = entry
        for (const p of parts) {
          cur = (cur as Record<string, unknown>)?.[p]
        }
        if (cur === undefined && onMissing) onMissing(parsed.path)
        return cur
      }
      if (parsed.kind === 'scoped' && parsed.scope === 'this' && parsed.op === 'field' && parsed.field) {
        return (entry as Record<string, unknown>)[parsed.field]
      }
      return undefined
    },
  }
}

const entry = { status: 'paid', total: 150, name: 'Alice', tag: 'gold' }
const ctx = makeContext(entry)

// ---------------------------------------------------------------------------
// null / empty → true
// ---------------------------------------------------------------------------

describe('evaluateWhen — null/empty', () => {
  it('null node returns true', () => {
    expect(evaluateWhen(null, ctx)).toBe(true)
  })

  it('empty AND group returns true', () => {
    const node: WhenNode = { kind: 'group', op: 'AND', children: [] }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('empty OR group returns false', () => {
    const node: WhenNode = { kind: 'group', op: 'OR', children: [] }
    expect(evaluateWhen(node, ctx)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Basic predicates
// ---------------------------------------------------------------------------

describe('evaluateWhen — predicates', () => {
  it('eq literal', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'eq',
      right: { kind: 'literal', value: 'paid' },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('eq literal fails', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'eq',
      right: { kind: 'literal', value: 'unpaid' },
    }
    expect(evaluateWhen(node, ctx)).toBe(false)
  })

  it('gt numeric', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.total' },
      op: 'gt',
      right: { kind: 'literal', value: 100 },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('lte numeric', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.total' },
      op: 'lte',
      right: { kind: 'literal', value: 150 },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('contains string', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.name' },
      op: 'contains',
      right: { kind: 'literal', value: 'lic' },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('startswith', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.name' },
      op: 'startswith',
      right: { kind: 'literal', value: 'Ali' },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('isempty — non-empty field', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'isempty',
    }
    expect(evaluateWhen(node, ctx)).toBe(false)
  })

  it('isnotempty — non-empty field', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.status' },
      op: 'isnotempty',
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('matches regex', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.tag' },
      op: 'matches',
      right: { kind: 'literal', value: '^g' },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('literal-to-literal comparison', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'literal', value: 10 },
      op: 'lt',
      right: { kind: 'literal', value: 20 },
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// AND / OR groups with short-circuit
// ---------------------------------------------------------------------------

describe('evaluateWhen — groups', () => {
  it('AND group — all true', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 100 } },
      ],
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('AND group — one false', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 200 } },
      ],
    }
    expect(evaluateWhen(node, ctx)).toBe(false)
  })

  it('OR group — first true short-circuits', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'OR',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 200 } },
      ],
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })

  it('negate wraps group result', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      negate: true,
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'paid' } },
      ],
    }
    expect(evaluateWhen(node, ctx)).toBe(false)
  })

  it('nested AND inside OR', () => {
    const node: WhenNode = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 100 } },
        {
          kind: 'group',
          op: 'OR',
          children: [
            { kind: 'predicate', left: { kind: 'ref', key: 'this.tag' }, op: 'eq', right: { kind: 'literal', value: 'gold' } },
            { kind: 'predicate', left: { kind: 'ref', key: 'this.total' }, op: 'gt', right: { kind: 'literal', value: 5000 } },
          ],
        },
      ],
    }
    expect(evaluateWhen(node, ctx)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// null handling
// ---------------------------------------------------------------------------

describe('evaluateWhen — null operands', () => {
  const emptyCtx = makeContext({})

  it('null == null → eq true', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.missing' },
      op: 'eq',
      right: { kind: 'literal', value: null },
    }
    expect(evaluateWhen(node, emptyCtx)).toBe(true)
  })

  it('null isempty → true', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.missing' },
      op: 'isempty',
    }
    expect(evaluateWhen(node, emptyCtx)).toBe(true)
  })

  it('null gt 0 → false (no exception)', () => {
    const node: WhenNode = {
      kind: 'predicate',
      left: { kind: 'ref', key: 'this.missing' },
      op: 'gt',
      right: { kind: 'literal', value: 0 },
    }
    expect(() => evaluateWhen(node, emptyCtx)).not.toThrow()
    expect(evaluateWhen(node, emptyCtx)).toBe(false)
  })
})

