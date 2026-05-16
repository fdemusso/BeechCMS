/**
 * Sprint 8 Task 11 — Recursive WhenNode evaluator.
 *
 * Evaluates a WhenNode (or legacy TriggerCondition[]) against a ResolvedContext.
 * Does NOT replace evaluateConditions in-place — existing call sites are migrated
 * in Task 13.
 *
 * Short-circuit semantics:
 *   AND → stops at first false
 *   OR  → stops at first true
 *   negate → wraps the group result in NOT
 *
 * Operands are resolved via ResolvedContext.lookup(), reusing the full template
 * grammar including batch, this, and inline seed scopes.
 */
import type { WhenNode, WhenPredicate, WhenGroup, WhenOperand, TriggerCondition } from '@beechcms/core'
import type { ResolvedContext } from './context-resolver'
import { parseTemplateKey } from './template-grammar'

export function evaluateWhen(
  node: WhenNode | TriggerCondition[] | null,
  context: ResolvedContext,
): boolean {
  if (!node) return true

  if (Array.isArray(node)) {
    return node.every((c) => evalLegacyCondition(c, context))
  }

  if (node.kind === 'predicate') return evalPredicate(node, context)
  return evalGroup(node, context)
}

function evalGroup(group: WhenGroup, context: ResolvedContext): boolean {
  if (group.children.length === 0) {
    const empty = group.op === 'AND'
    return group.negate ? !empty : empty
  }

  for (const child of group.children) {
    const r = evaluateWhen(child, context)
    if (group.op === 'AND' && !r) return group.negate ? true : false
    if (group.op === 'OR' && r)  return group.negate ? false : true
  }

  const combined = group.op === 'AND'
  return group.negate ? !combined : combined
}

function resolveOperand(operand: WhenOperand, context: ResolvedContext): unknown {
  if (operand.kind === 'literal') return operand.value

  // this.field (dot notation from UI) → this:field (colon, parsed as scoped key)
  const key = operand.key.startsWith('this.') ? 'this:' + operand.key.slice(5) : operand.key
  const parsed = parseTemplateKey(key)
  if (!parsed) return null

  const val = context.lookup(parsed)
  return val ?? null
}

function evalPredicate(pred: WhenPredicate, context: ResolvedContext): boolean {
  const left = resolveOperand(pred.left, context)
  const right = pred.right !== undefined ? resolveOperand(pred.right, context) : undefined
  return compare(pred.op, left, right)
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case 'isempty':    return left == null || left === ''
    case 'isnotempty': return left != null && left !== ''

    case 'eq':  return coerceEqual(left, right)
    case 'neq': return !coerceEqual(left, right)

    case 'gt':  return Number(left) > Number(right)
    case 'gte': return Number(left) >= Number(right)
    case 'lt':  return Number(left) < Number(right)
    case 'lte': return Number(left) <= Number(right)

    case 'contains':   return typeof left === 'string' && typeof right === 'string' && left.includes(right)
    case 'startswith': return typeof left === 'string' && typeof right === 'string' && left.startsWith(right)
    case 'endswith':   return typeof left === 'string' && typeof right === 'string' && left.endsWith(right)

    case 'in':    return Array.isArray(right) && right.some((r) => coerceEqual(left, r))
    case 'notin': return !Array.isArray(right) || !right.some((r) => coerceEqual(left, r))

    case 'matches': {
      if (typeof left !== 'string' || typeof right !== 'string') return false
      try { return new RegExp(right).test(left) } catch { return false }
    }

    default: return false
  }
}

function coerceEqual(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (typeof a === 'number' && typeof b === 'string' && !Number.isNaN(Number(b))) return a === Number(b)
  if (typeof b === 'number' && typeof a === 'string' && !Number.isNaN(Number(a))) return Number(a) === b
  return a === b
}

function evalLegacyCondition(c: TriggerCondition, context: ResolvedContext): boolean {
  const parsed = parseTemplateKey(`this:${c.field}`)
  const actual = parsed ? context.lookup(parsed) : undefined
  return compare(c.op, actual, c.value)
}
