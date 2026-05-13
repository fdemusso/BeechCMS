import { describe, it, expect } from 'vitest'
import { evaluateConditions, interpolate } from '../automation-runner.utils'

describe('evaluateConditions', () => {
  it('returns true when conditions is null', () => {
    expect(evaluateConditions(null, {})).toBe(true)
  })

  it('returns true when conditions is empty array', () => {
    expect(evaluateConditions([], { x: 1 })).toBe(true)
  })

  it('eq — matches strict equality', () => {
    expect(evaluateConditions([{ field: 'status', op: 'eq', value: 'published' }], { status: 'published' })).toBe(true)
    expect(evaluateConditions([{ field: 'status', op: 'eq', value: 'published' }], { status: 'draft' })).toBe(false)
    expect(evaluateConditions([{ field: 'count', op: 'eq', value: '1' }], { count: 1 })).toBe(false)
  })

  it('neq — not equal', () => {
    expect(evaluateConditions([{ field: 'status', op: 'neq', value: 'draft' }], { status: 'published' })).toBe(true)
    expect(evaluateConditions([{ field: 'status', op: 'neq', value: 'draft' }], { status: 'draft' })).toBe(false)
  })

  it('contains — substring check', () => {
    expect(evaluateConditions([{ field: 'title', op: 'contains', value: 'hello' }], { title: 'say hello world' })).toBe(true)
    expect(evaluateConditions([{ field: 'title', op: 'contains', value: 'hello' }], { title: 'goodbye' })).toBe(false)
    expect(evaluateConditions([{ field: 'count', op: 'contains', value: '1' }], { count: 123 })).toBe(false)
  })

  it('gt — numeric greater-than', () => {
    expect(evaluateConditions([{ field: 'age', op: 'gt', value: 18 }], { age: 20 })).toBe(true)
    expect(evaluateConditions([{ field: 'age', op: 'gt', value: 18 }], { age: 18 })).toBe(false)
    expect(evaluateConditions([{ field: 'age', op: 'gt', value: '18' }], { age: '25' })).toBe(true)
  })

  it('lt — numeric less-than', () => {
    expect(evaluateConditions([{ field: 'age', op: 'lt', value: 18 }], { age: 10 })).toBe(true)
    expect(evaluateConditions([{ field: 'age', op: 'lt', value: 18 }], { age: 18 })).toBe(false)
  })

  it('isempty — null or empty string', () => {
    expect(evaluateConditions([{ field: 'bio', op: 'isempty', value: null }], { bio: null })).toBe(true)
    expect(evaluateConditions([{ field: 'bio', op: 'isempty', value: null }], { bio: undefined })).toBe(true)
    expect(evaluateConditions([{ field: 'bio', op: 'isempty', value: null }], { bio: '' })).toBe(true)
    expect(evaluateConditions([{ field: 'bio', op: 'isempty', value: null }], { bio: 'something' })).toBe(false)
  })

  it('isnotempty — present and non-empty', () => {
    expect(evaluateConditions([{ field: 'bio', op: 'isnotempty', value: null }], { bio: 'something' })).toBe(true)
    expect(evaluateConditions([{ field: 'bio', op: 'isnotempty', value: null }], { bio: null })).toBe(false)
    expect(evaluateConditions([{ field: 'bio', op: 'isnotempty', value: null }], { bio: '' })).toBe(false)
  })

  it('all conditions must pass (AND semantics)', () => {
    const conditions = [
      { field: 'status', op: 'eq' as const, value: 'published' },
      { field: 'age', op: 'gt' as const, value: 18 },
    ]
    expect(evaluateConditions(conditions, { status: 'published', age: 25 })).toBe(true)
    expect(evaluateConditions(conditions, { status: 'published', age: 10 })).toBe(false)
  })

  it('missing field evaluates against undefined', () => {
    expect(evaluateConditions([{ field: 'missing', op: 'isempty', value: null }], {})).toBe(true)
  })
})

describe('interpolate', () => {
  it('replaces a single placeholder', () => {
    expect(interpolate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!')
  })

  it('replaces multiple placeholders', () => {
    expect(interpolate('{{greeting}}, {{name}}!', { greeting: 'Hi', name: 'Alice' })).toBe('Hi, Alice!')
  })

  it('missing field becomes empty string', () => {
    expect(interpolate('Hello {{name}}!', {})).toBe('Hello !')
  })

  it('no placeholders returns template unchanged', () => {
    expect(interpolate('No placeholders here', { name: 'World' })).toBe('No placeholders here')
  })

  it('handles numeric values', () => {
    expect(interpolate('Count: {{count}}', { count: 42 })).toBe('Count: 42')
  })
})
