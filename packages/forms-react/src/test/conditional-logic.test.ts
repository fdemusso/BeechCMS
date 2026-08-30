// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import {
  evaluateSingleCondition,
  evaluateCondition,
} from '../core/conditional-logic.js'

describe('conditional-logic', () => {
  it('handles "eq" and "neq" operators correctly', () => {
    const values = { role: 'admin', age: 30 }

    expect(evaluateSingleCondition({ field: 'role', op: 'eq', value: 'admin' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'role', op: 'eq', value: 'user' }, values)).toBe(false)
    expect(evaluateSingleCondition({ field: 'role', op: 'neq', value: 'user' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'role', op: 'neq', value: 'admin' }, values)).toBe(false)
  })

  it('handles numeric comparison operators (gt, gte, lt, lte)', () => {
    const values = { count: 10 }

    expect(evaluateSingleCondition({ field: 'count', op: 'gt', value: 5 }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'count', op: 'gt', value: 10 }, values)).toBe(false)
    expect(evaluateSingleCondition({ field: 'count', op: 'gte', value: 10 }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'count', op: 'lt', value: 15 }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'count', op: 'lt', value: 10 }, values)).toBe(false)
    expect(evaluateSingleCondition({ field: 'count', op: 'lte', value: 10 }, values)).toBe(true)
  })

  it('handles "in" and "not_in" operators', () => {
    const values = { category: 'tech' }

    expect(evaluateSingleCondition({ field: 'category', op: 'in', value: ['tech', 'science'] }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'category', op: 'in', value: ['art', 'music'] }, values)).toBe(false)
    expect(evaluateSingleCondition({ field: 'category', op: 'not_in', value: ['art', 'music'] }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'category', op: 'not_in', value: ['tech', 'art'] }, values)).toBe(false)
  })

  it('handles "is_empty" and "is_not_empty" operators', () => {
    const values = {
      emptyStr: '',
      nullVal: null,
      emptyArr: [],
      filledStr: 'hello',
      filledArr: [1, 2],
    }

    expect(evaluateSingleCondition({ field: 'emptyStr', op: 'is_empty' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'nullVal', op: 'is_empty' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'nonExistent', op: 'is_empty' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'emptyArr', op: 'is_empty' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'filledStr', op: 'is_empty' }, values)).toBe(false)

    expect(evaluateSingleCondition({ field: 'filledStr', op: 'is_not_empty' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'filledArr', op: 'is_not_empty' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'emptyStr', op: 'is_not_empty' }, values)).toBe(false)
    expect(evaluateSingleCondition({ field: 'nullVal', op: 'is_not_empty' }, values)).toBe(false)
  })

  it('handles "contains" operator for strings and arrays', () => {
    const values = {
      bio: 'fullstack developer in Milan',
      tags: ['react', 'typescript', 'hono'],
    }

    expect(evaluateSingleCondition({ field: 'bio', op: 'contains', value: 'developer' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'bio', op: 'contains', value: 'designer' }, values)).toBe(false)
    expect(evaluateSingleCondition({ field: 'tags', op: 'contains', value: 'typescript' }, values)).toBe(true)
    expect(evaluateSingleCondition({ field: 'tags', op: 'contains', value: 'vue' }, values)).toBe(false)
  })

  it('evaluates compound condition arrays (AND logic)', () => {
    const values = { country: 'IT', age: 25 }

    const conditions = [
      { field: 'country', op: 'eq' as const, value: 'IT' },
      { field: 'age', op: 'gte' as const, value: 18 },
    ]

    expect(evaluateCondition(conditions, values)).toBe(true)
    expect(evaluateCondition(conditions, { ...values, age: 16 })).toBe(false)
    expect(evaluateCondition(conditions, { ...values, country: 'FR' })).toBe(false)
  })

  it('returns true when condition is undefined', () => {
    expect(evaluateCondition(undefined, {})).toBe(true)
  })
})
