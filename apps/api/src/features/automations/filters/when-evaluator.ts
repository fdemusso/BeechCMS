// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { WhenNode, WhenPredicate, WhenGroup, WhenOperand } from '@beechcms/core'
import type { ResolvedContext } from '../evaluator/context-resolver'
import { parseTemplateKey } from '../evaluator/template-grammar'
import { numericValue } from '../evaluator/numeric'

export function evaluateWhen(
  node: WhenNode | null,
  context: ResolvedContext,
): boolean {
  if (!node) return true
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

/** A `tags` value is an array: equality and membership operators test its members. */
function isMember(left: unknown, right: unknown): boolean {
  return Array.isArray(left) ? left.some((member) => coerceEqual(member, right)) : coerceEqual(left, right)
}

function isEmptyValue(value: unknown): boolean {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case 'isempty':    return isEmptyValue(left)
    case 'isnotempty': return !isEmptyValue(left)

    case 'eq':  return isMember(left, right)
    case 'neq': return !isMember(left, right)

    case 'gt':  return compareNumbers(left, right, (a, b) => a > b)
    case 'gte': return compareNumbers(left, right, (a, b) => a >= b)
    case 'lt':  return compareNumbers(left, right, (a, b) => a < b)
    case 'lte': return compareNumbers(left, right, (a, b) => a <= b)

    case 'contains':
      if (Array.isArray(left)) return typeof right === 'string' && left.includes(right)
      return typeof left === 'string' && typeof right === 'string' && left.includes(right)
    case 'startswith': return typeof left === 'string' && typeof right === 'string' && left.startsWith(right)
    case 'endswith':   return typeof left === 'string' && typeof right === 'string' && left.endsWith(right)

    case 'in':    return Array.isArray(right) && right.some((r) => isMember(left, r))
    case 'notin': return !Array.isArray(right) || !right.some((r) => isMember(left, r))

    case 'matches': {
      if (typeof left !== 'string' || typeof right !== 'string') return false
      try { return new RegExp(right).test(left) } catch { return false }
    }

    default: return false
  }
}

/** A missing or non-numeric side is not comparable: it must not satisfy any range, whatever Number() would make of it. */
function compareNumbers(left: unknown, right: unknown, test: (a: number, b: number) => boolean): boolean {
  const a = numericValue(left)
  const b = numericValue(right)
  return a !== null && b !== null && test(a, b)
}

function coerceEqual(a: unknown, b: unknown): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  if (typeof a === 'number' && typeof b === 'string' && numericValue(b) !== null) return a === numericValue(b)
  if (typeof b === 'number' && typeof a === 'string' && numericValue(a) !== null) return numericValue(a) === b
  return a === b
}
