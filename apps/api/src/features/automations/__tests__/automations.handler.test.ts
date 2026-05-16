import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { IAutomationRepository, Automation } from '@beechcms/core'
import { automationsApp } from '../automations.handler'

const baseAutomation: Automation = {
  id: 'test-id',
  seed_slug: 'posts',
  name: 'test',
  enabled: true,
  triggers: [{ event: 'create' }],
  trigger_conditions: null,
  actions: [{ type: 'webhook', url: 'https://example.com' }],
  created_at: 1000,
  updated_at: 1000,
}

function makeStub(overrides: Partial<IAutomationRepository> = {}): IAutomationRepository {
  return {
    list: vi.fn().mockResolvedValue([baseAutomation]),
    findById: vi.fn().mockResolvedValue(baseAutomation),
    findActive: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue('new-id'),
    update: vi.fn().mockResolvedValue(undefined),
    toggle: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function buildApp(stub: IAutomationRepository) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(c as any).set('automationRepository', stub)
    await next()
  })
  app.route('/', automationsApp)
  return app
}

describe('GET /', () => {
  it('returns 400 missing-seed without ?seed=', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/')
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('missing-seed')
  })

  it('returns 200 with automations list', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/?seed=posts')
    expect(res.status).toBe(200)
    const body = await res.json() as Automation[]
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('test-id')
  })
})

describe('POST /', () => {
  it('returns 400 invalid-json for malformed JSON body', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'malformed-not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('invalid-json')
  })

  it('returns 400 automation-validation-failed for schema non-compliant body', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed_slug: 'posts' }), // missing name, triggers, actions
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('automation-validation-failed')
  })

  it('returns 201 with id for valid body including optional trigger fields', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_slug: 'posts',
        name: 'test-cron-automation',
        triggers: [{ event: 'cron', cron: '0 0 * * *' }],
        trigger_conditions: [{ field: 'status', op: 'eq', value: 'draft' }],
        actions: [{ type: 'webhook', url: 'https://example.com' }],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string }
    expect(body.id).toBe('new-id')
  })

  it('returns 201 with id for valid body omitting optional trigger fields', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed_slug: 'posts',
        name: 'test-create-automation',
        triggers: [{ event: 'create' }],
        actions: [{ type: 'webhook', url: 'https://example.com' }],
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { id: string }
    expect(body.id).toBe('new-id')
  })
})

describe('GET /:id', () => {
  it('returns 404 when not found', async () => {
    const app = buildApp(makeStub({ findById: vi.fn().mockResolvedValue(null) }))
    const res = await app.request('/unknown-id')
    expect(res.status).toBe(404)
  })

  it('returns 200 with automation', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id')
    expect(res.status).toBe(200)
  })
})

describe('PUT /:id', () => {
  it('returns 404 when not found', async () => {
    const app = buildApp(makeStub({ findById: vi.fn().mockResolvedValue(null) }))
    const res = await app.request('/unknown-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 invalid-json for malformed JSON body', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: 'malformed-not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('invalid-json')
  })

  it('returns 400 automation-validation-failed for invalid update values', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 12345 }), // name must be string
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('automation-validation-failed')
  })

  it('returns 400 when cron trigger has no cron expression', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggers: [{ event: 'cron' }] }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('automation-validation-failed')
  })

  it('returns 204 for valid update', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'renamed' }),
    })
    expect(res.status).toBe(204)
  })
})

describe('PATCH /:id/toggle', () => {
  it('returns 404 when automation not found', async () => {
    const app = buildApp(makeStub({ findById: vi.fn().mockResolvedValue(null) }))
    const res = await app.request('/unknown-id/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 400 invalid-json for malformed JSON body', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'malformed-not-json',
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('invalid-json')
  })

  it('returns 400 automation-validation-failed for invalid payload', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: 'not-a-boolean' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { type: string }
    expect(body.type).toContain('automation-validation-failed')
  })

  it('returns 204 and calls toggle(id, false)', async () => {
    const stub = makeStub()
    const app = buildApp(stub)
    const res = await app.request('/test-id/toggle', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    })
    expect(res.status).toBe(204)
    expect(stub.toggle).toHaveBeenCalledWith('test-id', false)
  })
})

describe('DELETE /:id', () => {
  it('returns 404 when not found', async () => {
    const app = buildApp(makeStub({ findById: vi.fn().mockResolvedValue(null) }))
    const res = await app.request('/unknown-id', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 204 on success', async () => {
    const app = buildApp(makeStub())
    const res = await app.request('/test-id', { method: 'DELETE' })
    expect(res.status).toBe(204)
  })
})
