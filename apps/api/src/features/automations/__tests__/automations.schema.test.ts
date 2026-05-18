import { describe, it, expect } from 'vitest'
import {
  createAutomationSchema,
  updateAutomationSchema,
  toggleAutomationSchema,
} from '../automations.schema'

const validWebhookAction = { type: 'webhook' as const, url: 'https://example.com/hook' }

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
      actions: [{ type: 'webhook', url: 'not-a-url' }],
    })
    expect(result.success).toBe(false)
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
