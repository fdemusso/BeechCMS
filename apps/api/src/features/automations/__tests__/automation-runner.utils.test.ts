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

  it('returns false for unknown operator (edge case)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(evaluateConditions([{ field: 'status', op: 'unknown' as any, value: 'test' }], { status: 'test' })).toBe(false)
  })
})

describe('interpolate', () => {
  it('replaces a single placeholder', () => {
    expect(interpolate('Hello {{name}}!', { name: 'World' })).toBe('Hello World!')
  })

  it('replaces multiple placeholders', () => {
    expect(interpolate('{{greeting}}, {{name}}!', { greeting: 'Hi', name: 'Alice' })).toBe('Hi, Alice!')
  })

  it('missing field becomes empty string by default', () => {
    expect(interpolate('Hello {{name}}!', {})).toBe('Hello !')
  })

  it('no placeholders returns template unchanged', () => {
    expect(interpolate('No placeholders here', { name: 'World' })).toBe('No placeholders here')
  })

  it('handles numeric values', () => {
    expect(interpolate('Count: {{count}}', { count: 42 })).toBe('Count: 42')
  })

  it('supports single brace notation {campo} to avoid excess parentheses', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!')
  })

  it('supports spaces inside braces', () => {
    expect(interpolate('Hello { name }!', { name: 'Space' })).toBe('Hello Space!')
    expect(interpolate('Hello {{ name }}!', { name: 'DoubleSpace' })).toBe('Hello DoubleSpace!')
  })

  it('supports concrete nested data fetching via dot notation', () => {
    const entry = { author: { name: 'Flavio', role: 'admin' } }
    expect(interpolate('Author: { author.name } ({author.role})', entry)).toBe('Author: Flavio (admin)')
  })

  it('uses custom default value when a field is missing', () => {
    expect(interpolate('Hello {name}!', {}, '[missing]')).toBe('Hello [missing]!')
  })

  it('triggers onMissing callback when concrete data is absent', () => {
    const missing: string[] = []
    const res = interpolate('Hello {name}! From {city}', {}, '[mancante]', (f) => missing.push(f))
    expect(res).toBe('Hello [mancante]! From [mancante]')
    expect(missing).toEqual(['name', 'city'])
  })

  it('returns default value when nested object lookup encounters primitive or null intermediate parts', () => {
    const entry = { author: 'Flavio' } // not an object
    expect(interpolate('Author Name: {author.name}', entry, '[missing]')).toBe('Author Name: [missing]')
  })

  it('returns empty string when template is falsy', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(interpolate('' as any, {})).toBe('')
  })
})
