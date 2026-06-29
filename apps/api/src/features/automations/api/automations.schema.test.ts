// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect } from 'vitest'
import {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
} from './automations.schema'

const validWebhookAction = { type: 'webhook' as const, url: 'https://example.com/hook', body_template: '{}' }

const minimalValid = {
  seed_slug: 'posts',
  name: 'notify-on-create',
  triggers: [{ event: 'create' as const }],
  actions: [validWebhookAction],
}

describe('createAutomationSchema', () => {
  it('accepts minimal valid create payload', () => {
    expect(createAutomationSchema.safeParse(minimalValid).success).toBe(true)
  })

  it('rejects cron trigger without cron expression', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      triggers: [{ event: 'cron' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts cron trigger with cron expression', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      triggers: [{ event: 'cron', cron: '0 * * * *' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects duplicate trigger events', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      triggers: [{ event: 'create' }, { event: 'create' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts multiple distinct triggers', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      triggers: [{ event: 'create' }, { event: 'update' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty actions array', () => {
    const result = createAutomationSchema.safeParse({ ...minimalValid, actions: [] })
    expect(result.success).toBe(false)
  })

  it('rejects unknown action type', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'unknown_type', url: 'https://example.com' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects webhook with non-url', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'not-a-url', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects webhook with HTTP url (not HTTPS)', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'http://example.com', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
    const issues = result.error?.issues ?? []
    expect(issues.some((i) => i.message === 'automations.editor.errors.webhookHttpsRequired')).toBe(true)
  })

  it('rejects webhook with localhost url', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://localhost/x', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
    const issues = result.error?.issues ?? []
    expect(issues.some((i) => i.message === 'automations.editor.errors.webhookPrivateHostBlocked')).toBe(true)
  })

  it('rejects webhook with 127.0.0.1', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://127.0.0.1/x', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects webhook with AWS metadata IP (169.254.169.254)', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://169.254.169.254/x', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects webhook with 10.x.x.x private IP', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://10.0.0.5/x', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects webhook with 192.168.x.x private IP', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://192.168.1.1/x', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects webhook with 172.16.x.x private IP', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://172.16.0.1/x', body_template: '{}' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts webhook with 172.32.x.x (outside private range)', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://172.32.0.1/x', body_template: '{}' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects webhook without body_template', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://example.com/x' }],
    })
    expect(result.success).toBe(false)
    const issues = result.error?.issues ?? []
    expect(issues.some((i) => i.message === 'automations.editor.errors.bodyRequired')).toBe(true)
  })

  it('accepts webhook with valid HTTPS public url and body_template', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'webhook', url: 'https://example.com/x', body_template: '{}' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects send_mail with invalid email', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      actions: [{ type: 'send_mail', to: 'not-an-email', subject_template: 'hi', body_template: 'body' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts trigger_conditions as null', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      trigger_conditions: null,
    })

    expect(result.success).toBe(true)
  })

  it('accepts trigger_conditions as WhenNode', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      trigger_conditions: {
        kind: 'group',
        op: 'AND',
        children: [
          { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'published' } },
        ],
      },
    })
    expect(result.success).toBe(true)
  })
})

describe('updateAutomationSchema', () => {
  it('accepts empty object', () => {
    expect(updateAutomationSchema.safeParse({}).success).toBe(true)
  })

  it('accepts name-only without requiring triggers', () => {
    const result = updateAutomationSchema.safeParse({ name: 'renamed' })
    expect(result.success).toBe(true)
  })
})

describe('toggleAutomationSchema', () => {
  it('accepts { enabled: true }', () => {
    expect(toggleAutomationSchema.safeParse({ enabled: true }).success).toBe(true)
  })

  it('accepts { enabled: false }', () => {
    expect(toggleAutomationSchema.safeParse({ enabled: false }).success).toBe(true)
  })

  it('rejects missing enabled', () => {
    expect(toggleAutomationSchema.safeParse({}).success).toBe(false)
  })

  it('rejects non-boolean enabled', () => {
    expect(toggleAutomationSchema.safeParse({ enabled: 'true' }).success).toBe(false)
  })
})
