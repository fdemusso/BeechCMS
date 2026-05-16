/**
 * Sprint 8 Task 12 — SQL push-down filter extractor.
 *
 * Given a WhenNode tree, returns ONLY the FilterGroup[]  that are safe
 * to push into a D1/SQLite WHERE clause:
 *   - Direct predicate children of the outermost AND group (not inside OR)
 *   - Left operand is a `this.<field>` ref (single-entry, current seed)
 *   - Right operand is a literal (static value — no cross-seed refs)
 *   - Operator is supported by FilterGroup (eq, neq, contains, gt, lt, isempty, isnotempty)
 *
 * Everything else (OR branches, cross-seed refs, aggregates, gte/lte/etc.) is
 * kept in-memory and evaluated by evaluateWhen() per entry.
 */
import type { WhenNode, WhenPredicate, TriggerCondition, FilterGroup, Seed } from '@beechcms/core'
import { conditionToFilterGroup } from './filter-translation'

const PUSHDOWN_OPS = new Set<string>(['eq', 'neq', 'contains', 'gt', 'lt', 'isempty', 'isnotempty'])

export function extractPushdownFilters(
  node: WhenNode | TriggerCondition[] | null,
  seed: Seed,
): FilterGroup[] {
  if (!node) return []

  // Legacy flat array — all conditions are safe to push
  if (Array.isArray(node)) {
    return node.map((c) => conditionToFilterGroup(c, seed))
  }

  // Single predicate at root
  if (node.kind === 'predicate') {
    const f = tryPushdown(node, seed)
    return f ? [f] : []
  }

  // Only extract direct predicate children of the outermost AND group (non-negated)
  if (node.kind === 'group' && node.op === 'AND' && !node.negate) {
    return node.children.flatMap((child) => {
      if (child.kind !== 'predicate') return []
      const f = tryPushdown(child, seed)
      return f ? [f] : []
    })
  }

  return []
}

function tryPushdown(pred: WhenPredicate, seed: Seed): FilterGroup | null {
  if (pred.left.kind !== 'ref') return null

  const key = pred.left.key
  if (!key.startsWith('this.')) return null
  const field = key.slice(5)
  if (!field) return null

  if (!PUSHDOWN_OPS.has(pred.op)) return null

  if (pred.op === 'isempty' || pred.op === 'isnotempty') {
    return conditionToFilterGroup(
      { field, op: pred.op as TriggerCondition['op'], value: null },
      seed,
    )
  }

  if (!pred.right || pred.right.kind !== 'literal') return null

  return conditionToFilterGroup(
    { field, op: pred.op as TriggerCondition['op'], value: pred.right.value },
    seed,
  )
}
