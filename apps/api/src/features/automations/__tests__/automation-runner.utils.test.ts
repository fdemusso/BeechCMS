import { describe, it, expect } from 'vitest'
import { interpolate } from '../automation-runner.utils'
import { resolveAutomationContext } from '../context-resolver'

async function makeCtx(entry: Record<string, unknown>) {
  return resolveAutomationContext({} as any, entry, [entry])
}

describe('interpolate', () => {
  it('replaces a single placeholder', async () => {
    expect(interpolate('Hello {{name}}!', await makeCtx({ name: 'World' }))).toBe('Hello World!')
  })

  it('replaces multiple placeholders', async () => {
    expect(interpolate('{{name}} is {{status}}', await makeCtx({ name: 'Alice', status: 'active' }))).toBe('Alice is active')
  })

  it('missing field becomes empty string by default', async () => {
    expect(interpolate('Hello {{name}}!', await makeCtx({}))).toBe('Hello !')
  })

  it('no placeholders returns template unchanged', async () => {
    expect(interpolate('No placeholders here', await makeCtx({ name: 'World' }))).toBe('No placeholders here')
  })

  it('handles numeric values', async () => {
    expect(interpolate('Count: {{count}}', await makeCtx({ count: 42 }))).toBe('Count: 42')
  })

  it('supports spaces inside double braces', async () => {
    expect(interpolate('Hello {{ name }}!', await makeCtx({ name: 'DoubleSpace' }))).toBe('Hello DoubleSpace!')
  })

  it('uses custom default value when a field is missing', async () => {
    expect(interpolate('Hello {{name}}!', await makeCtx({}), '[missing]')).toBe('Hello [missing]!')
  })

  it('triggers onMissing callback when field is absent', async () => {
    const missing: string[] = []
    const res = interpolate('Hello {{name}}! From {{city}}', await makeCtx({}), '[mancante]', (f) => missing.push(f))
    expect(res).toBe('Hello [mancante]! From [mancante]')
    expect(missing).toEqual(['name', 'city'])
  })

  it('returns empty string when template is falsy', async () => {
    expect(interpolate('' as any, await makeCtx({}))).toBe('')
  })

  it('resolves {{this.field}} dot notation against the trigger entry', async () => {
    expect(interpolate('{{this.customer_id}}', await makeCtx({ customer_id: 'cust-42' }))).toBe('cust-42')
  })

  it('resolves {{this:field}} colon notation against the trigger entry', async () => {
    expect(interpolate('{{this:customer_id}}', await makeCtx({ customer_id: 'cust-42' }))).toBe('cust-42')
  })
})
