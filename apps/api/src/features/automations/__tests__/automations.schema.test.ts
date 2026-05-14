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
  trigger_event: 'create' as const,
  actions: [validWebhookAction],
}

describe('createAutomationSchema', () => {
  it('accepts minimal valid create payload', () => {
    expect(createAutomationSchema.safeParse(minimalValid).success).toBe(true)
  })

  it('rejects cron event without trigger_cron', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      trigger_event: 'cron',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(i => i.path.includes('trigger_cron'))
      expect(issue).toBeDefined()
    }
  })

  it('accepts cron event with trigger_cron', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      trigger_event: 'cron',
      trigger_cron: '0 * * * *',
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

  it('accepts trigger_conditions as array', () => {
    const result = createAutomationSchema.safeParse({
      ...minimalValid,
      trigger_conditions: [{ field: 'status', op: 'eq', value: 'published' }],
    })
    expect(result.success).toBe(true)
  })
})

describe('updateAutomationSchema', () => {
  it('accepts empty object', () => {
    expect(updateAutomationSchema.safeParse({}).success).toBe(true)
  })

  it('accepts name-only without requiring trigger_cron', () => {
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
