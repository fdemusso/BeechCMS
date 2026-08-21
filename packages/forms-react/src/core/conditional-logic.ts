// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ConditionalRule } from '../types.js'

export function evaluateSingleCondition(rule: ConditionalRule, formValues: Record<string, unknown>): boolean {
  const currentVal = formValues[rule.field]
  const targetVal = rule.value

  switch (rule.op) {
    case 'eq':
      return currentVal === targetVal
    case 'neq':
      return currentVal !== targetVal
    case 'gt':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal > targetVal
    case 'gte':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal >= targetVal
    case 'lt':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal < targetVal
    case 'lte':
      return typeof currentVal === 'number' && typeof targetVal === 'number' && currentVal <= targetVal
    case 'in':
      return Array.isArray(targetVal) && targetVal.includes(currentVal)
    case 'not_in':
      return Array.isArray(targetVal) && !targetVal.includes(currentVal)
    case 'is_empty':
      return currentVal === undefined || currentVal === null || currentVal === '' || (Array.isArray(currentVal) && currentVal.length === 0)
    case 'is_not_empty':
      return currentVal !== undefined && currentVal !== null && currentVal !== '' && (!Array.isArray(currentVal) || currentVal.length > 0)
    case 'contains':
      if (typeof currentVal === 'string' && typeof targetVal === 'string') {
        return currentVal.includes(targetVal)
      }
      if (Array.isArray(currentVal)) {
        return currentVal.includes(targetVal)
      }
      return false
    default:
      return true
  }
}

export function evaluateCondition(
  condition: ConditionalRule | ConditionalRule[] | undefined,
  formValues: Record<string, unknown>
): boolean {
  if (!condition) return true
  if (Array.isArray(condition)) {
    return condition.every((rule) => evaluateSingleCondition(rule, formValues))
  }
  return evaluateSingleCondition(condition, formValues)
}
