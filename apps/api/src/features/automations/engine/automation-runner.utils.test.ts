// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import { interpolate } from './automation-runner.utils'
import { resolveAutomationContext } from '../evaluator/context-resolver'

async function makeCtx(entry: Record<string, unknown>) {
  return resolveAutomationContext({} as any, entry, [entry])
}

describe('interpolate', () => {
  it('replaces a single placeholder', async () => {
    expect(interpolate('Hello {{name}}!', await makeCtx({ name: 'World' }), { escape: 'none' })).toBe('Hello World!')
  })

  it('replaces multiple placeholders', async () => {
    expect(interpolate('{{name}} is {{status}}', await makeCtx({ name: 'Alice', status: 'active' }), { escape: 'none' })).toBe('Alice is active')
  })

  it('missing field becomes empty string by default', async () => {
    expect(interpolate('Hello {{name}}!', await makeCtx({}), { escape: 'none' })).toBe('Hello !')
  })

  it('no placeholders returns template unchanged', async () => {
    expect(interpolate('No placeholders here', await makeCtx({ name: 'World' }), { escape: 'none' })).toBe('No placeholders here')
  })

  it('handles numeric values', async () => {
    expect(interpolate('Count: {{count}}', await makeCtx({ count: 42 }), { escape: 'none' })).toBe('Count: 42')
  })

  it('supports spaces inside double braces', async () => {
    expect(interpolate('Hello {{ name }}!', await makeCtx({ name: 'DoubleSpace' }), { escape: 'none' })).toBe('Hello DoubleSpace!')
  })

  it('uses custom default value when a field is missing', async () => {
    expect(interpolate('Hello {{name}}!', await makeCtx({}), { escape: 'none', defaultValue: '[missing]' })).toBe('Hello [missing]!')
  })

  it('triggers onMissing callback when field is absent', async () => {
    const missing: string[] = []
    const res = interpolate('Hello {{name}}! From {{city}}', await makeCtx({}), { escape: 'none', defaultValue: '[mancante]', onMissing: (f) => missing.push(f) })
    expect(res).toBe('Hello [mancante]! From [mancante]')
    expect(missing).toEqual(['name', 'city'])
  })

  it('returns empty string when template is falsy', async () => {
    expect(interpolate('' as any, await makeCtx({}), { escape: 'none' })).toBe('')
  })

  it('resolves {{this.field}} dot notation against the trigger entry', async () => {
    expect(interpolate('{{this.customer_id}}', await makeCtx({ customer_id: 'cust-42' }), { escape: 'none' })).toBe('cust-42')
  })

  it('resolves {{this:field}} colon notation against the trigger entry', async () => {
    expect(interpolate('{{this:customer_id}}', await makeCtx({ customer_id: 'cust-42' }), { escape: 'none' })).toBe('cust-42')
  })

  it('HTML-escapes a substituted field value so it cannot inject markup into the email body', async () => {
    const malicious = '<a href="https://evil.example/login">click</a><img src=x onerror=alert(1)>'
    const res = interpolate('New submission: {{this.message}}', await makeCtx({ message: malicious }), { escape: 'html' })
    expect(res).toBe(
      'New submission: &lt;a href=&quot;https://evil.example/login&quot;&gt;click&lt;/a&gt;&lt;img src=x onerror=alert(1)&gt;',
    )
    expect(res).not.toContain('<a ')
    expect(res).not.toContain('<img')
  })

  it('leaves the surrounding admin-authored template markup untouched', async () => {
    expect(interpolate('<b>{{name}}</b>', await makeCtx({ name: '<script>x</script>' }), { escape: 'html' })).toBe(
      '<b>&lt;script&gt;x&lt;/script&gt;</b>',
    )
  })

  it("escape 'none' substitutes a value containing HTML-special characters verbatim", async () => {
    const res = interpolate('{{name}}', await makeCtx({ name: "O'Brien & <Sons>" }), { escape: 'none' })

    expect(res).toBe("O'Brien & <Sons>")
  })
})
