// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { dashboardLayoutApp } from '../dashboard-layout.handler'
import type { DashboardLayout, DashboardLayoutRecord, IDashboardLayoutRepository } from '@beechcms/core'
import type { Env, Variables } from '../../../types'

// ---------------------------------------------------------------------------
// Helpers and Mocks
// ---------------------------------------------------------------------------

/** Stateful in-memory stub so PUT/DELETE effects are observable by a later GET. */
function makeRepoStub(initial: DashboardLayoutRecord | null = null): IDashboardLayoutRepository {
  let state = initial
  return {
    get: vi.fn(async (scope: string) => (state && state.scope === scope ? state : null)),
    listScopes: vi.fn(async () => (state ? [state.scope] : [])),
    upsert: vi.fn(async (scope: string, layout: DashboardLayout, updatedBy: string) => {
      state = { scope, layout, updatedAt: 0, updatedBy }
    }),
    remove: vi.fn(async (scope: string) => {
      if (state?.scope === scope) state = null
    }),
  }
}

/** Stateful in-memory stub supporting multiple scopes at once. */
function makeMultiRepoStub(initial: Record<string, DashboardLayout> = {}): IDashboardLayoutRepository {
  const state = new Map<string, DashboardLayoutRecord>(
    Object.entries(initial).map(([scope, layout]) => [scope, { scope, layout, updatedAt: 0, updatedBy: 'seed' }]),
  )
  return {
    get: vi.fn(async (scope: string) => state.get(scope) ?? null),
    listScopes: vi.fn(async () => [...state.keys()]),
    upsert: vi.fn(async (scope: string, layout: DashboardLayout, updatedBy: string) => {
      state.set(scope, { scope, layout, updatedAt: 0, updatedBy })
    }),
    remove: vi.fn(async (scope: string) => {
      state.delete(scope)
    }),
  }
}

function buildApp(opts: {
  repo?: IDashboardLayoutRepository
  role?: string
  seedSlugs?: string[]
} = {}) {
  const repo = opts.repo ?? makeRepoStub()
  const app = new Hono<{ Bindings: Env; Variables: Variables }>()
  app.use('*', async (c, next) => {
    c.set('dashboardLayoutRepository', repo)
    c.set('seedRegistry', {
      all: () => (opts.seedSlugs ?? ['articoli']).map((slug) => ({ slug })),
    } as any)
    c.set('jwtPayload', { sub: 'user-1', role: opts.role ?? 'admin', email: 'user@beechcms.com' } as any)
    await next()
  })
  app.route('/', dashboardLayoutApp)
  return { app, repo }
}

const validLayout: DashboardLayout = {
  version: 1,
  pages: [
    {
      id: 'page-1',
      slug: 'overview',
      label: 'Overview',
      sections: [
        {
          id: 'section-1',
          columns: [{ id: 'col-1', widgets: [{ id: 'w1', type: 'core/stat', config: {} }] }],
        },
      ],
    },
  ],
}

function putRequest(body: unknown) {
  return {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard Layout Handler', () => {
  describe('GET /', () => {
    it('returns layout: null when no row exists', async () => {
      const { app } = buildApp()
      const res = await app.request('/')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ scope: 'default', layout: null })
    })
  })

  describe('PUT /', () => {
    it('returns 403 problem+json for an editor', async () => {
      const { app } = buildApp({ role: 'editor' })
      const res = await app.request('/', putRequest(validLayout))
      expect(res.status).toBe(403)
      expect(res.headers.get('Content-Type')).toContain('application/problem+json')
      const body = await res.json() as { type: string }
      expect(body.type).toContain('forbidden')
    })

    it('returns 400 invalid-json for malformed JSON body', async () => {
      const { app } = buildApp()
      const res = await app.request('/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(res.status).toBe(400)
      const body = await res.json() as { type: string }
      expect(body.type).toContain('invalid-json')
    })

    it('returns 422 for a shape that fails Zod validation', async () => {
      const { app } = buildApp()
      const res = await app.request('/', putRequest({ version: 2, pages: [] }))
      expect(res.status).toBe(422)
      const body = await res.json() as { type: string }
      expect(body.type).toContain('invalid-layout')
    })

    it('returns 422 when the layout has duplicate widget ids', async () => {
      const duplicateLayout: DashboardLayout = {
        version: 1,
        pages: [
          {
            id: 'page-1',
            slug: 'overview',
            label: 'Overview',
            sections: [
              {
                id: 'section-1',
                columns: [
                  { id: 'col-1', widgets: [{ id: 'dup', type: 'core/stat', config: {} }] },
                  { id: 'col-2', widgets: [{ id: 'dup', type: 'core/stat', config: {} }] },
                ],
                columnSpans: [6, 6],
              },
            ],
          },
        ],
      }
      const { app } = buildApp()
      const res = await app.request('/', putRequest(duplicateLayout))
      expect(res.status).toBe(422)
      const body = await res.json() as { type: string; detail: string }
      expect(body.type).toContain('invalid-layout')
      expect(body.detail).toContain('dup')
    })

    it('strips widgets bound to a non-existent seed and reports a warning', async () => {
      const layoutWithGhostSeed: DashboardLayout = {
        version: 1,
        pages: [
          {
            id: 'page-1',
            slug: 'overview',
            label: 'Overview',
            sections: [
              {
                id: 'section-1',
                columns: [
                  {
                    id: 'col-1',
                    widgets: [
                      { id: 'w1', type: 'core/recent-content', config: { seedSlug: 'ghost-seed' } },
                      { id: 'w2', type: 'core/stat', config: {} },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }
      const { app, repo } = buildApp({ seedSlugs: ['articoli'] })
      const res = await app.request('/', putRequest(layoutWithGhostSeed))
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; layout: DashboardLayout; warnings: string[] }
      expect(body.ok).toBe(true)
      expect(body.warnings.length).toBeGreaterThan(0)

      const widgetIds = body.layout.pages[0].sections[0].columns[0].widgets.map((w) => w.id)
      expect(widgetIds).toEqual(['w2'])
      expect(repo.upsert).toHaveBeenCalledWith('default', body.layout, 'user-1')
    })

    it('passes through an unknown widget type unchanged with no warning', async () => {
      const layoutWithUnknownWidget: DashboardLayout = {
        version: 1,
        pages: [
          {
            id: 'page-1',
            slug: 'overview',
            label: 'Overview',
            sections: [
              {
                id: 'section-1',
                columns: [{ id: 'col-1', widgets: [{ id: 'w1', type: '@acme/ghost', config: {} }] }],
              },
            ],
          },
        ],
      }
      const { app } = buildApp()
      const res = await app.request('/', putRequest(layoutWithUnknownWidget))
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; layout: DashboardLayout; warnings: string[] }
      expect(body.warnings).toEqual([])
      expect(body.layout.pages[0].sections[0].columns[0].widgets[0]).toEqual({
        id: 'w1',
        type: '@acme/ghost',
        config: {},
      })
    })

    it('persists a valid layout as admin and returns it on a subsequent GET', async () => {
      const { app } = buildApp()

      const putRes = await app.request('/', putRequest(validLayout))
      expect(putRes.status).toBe(200)
      const putBody = await putRes.json() as { ok: boolean; layout: DashboardLayout }
      expect(putBody.ok).toBe(true)

      const getRes = await app.request('/')
      expect(getRes.status).toBe(200)
      const getBody = await getRes.json() as { scope: string; layout: DashboardLayout }
      expect(getBody.scope).toBe('default')
      expect(getBody.layout).toEqual(putBody.layout)
    })
  })

  describe('DELETE /', () => {
    it('returns 403 problem+json for an editor', async () => {
      const { app } = buildApp({ role: 'editor' })
      const res = await app.request('/', { method: 'DELETE' })
      expect(res.status).toBe(403)
      expect(res.headers.get('Content-Type')).toContain('application/problem+json')
    })

    it('removes the stored layout as admin; subsequent GET returns layout: null', async () => {
      const repo = makeRepoStub({ scope: 'default', layout: validLayout, updatedAt: 0, updatedBy: 'admin-1' })
      const { app } = buildApp({ repo })

      const delRes = await app.request('/', { method: 'DELETE' })
      expect(delRes.status).toBe(200)
      expect(await delRes.json()).toEqual({ ok: true })

      const getRes = await app.request('/')
      expect(await getRes.json()).toEqual({ scope: 'default', layout: null })
    })
  })

  // ---------------------------------------------------------------------------
  // Sprint 06: role-based dashboards
  // ---------------------------------------------------------------------------

  describe('GET / — scope resolution matrix', () => {
    it('returns default + layout: null when nothing is stored (editor)', async () => {
      const { app } = buildApp({ role: 'editor', repo: makeMultiRepoStub() })
      const res = await app.request('/')
      expect(await res.json()).toEqual({ scope: 'default', layout: null })
    })

    it('returns default when only default is stored (editor)', async () => {
      const repo = makeMultiRepoStub({ default: validLayout })
      const { app } = buildApp({ role: 'editor', repo })
      const res = await app.request('/')
      const body = await res.json() as { scope: string; layout: DashboardLayout }
      expect(body.scope).toBe('default')
      expect(body.layout).toEqual(validLayout)
    })

    it('returns role:editor when only role:editor is stored (editor)', async () => {
      const repo = makeMultiRepoStub({ 'role:editor': validLayout })
      const { app } = buildApp({ role: 'editor', repo })
      const res = await app.request('/')
      const body = await res.json() as { scope: string; layout: DashboardLayout }
      expect(body.scope).toBe('role:editor')
      expect(body.layout).toEqual(validLayout)
    })

    it('returns role:editor when both are stored (editor)', async () => {
      const otherLayout: DashboardLayout = { version: 1, pages: [{ ...validLayout.pages[0], slug: 'other' }] }
      const repo = makeMultiRepoStub({ default: otherLayout, 'role:editor': validLayout })
      const { app } = buildApp({ role: 'editor', repo })
      const res = await app.request('/')
      const body = await res.json() as { scope: string; layout: DashboardLayout }
      expect(body.scope).toBe('role:editor')
      expect(body.layout).toEqual(validLayout)
    })

    it('ignores role:editor for an admin caller, falling back to default + null', async () => {
      const repo = makeMultiRepoStub({ 'role:editor': validLayout })
      const { app } = buildApp({ role: 'admin', repo })
      const res = await app.request('/')
      expect(await res.json()).toEqual({ scope: 'default', layout: null })
    })
  })

  describe('PUT/DELETE /:scope', () => {
    it('admin can write role:editor (200)', async () => {
      const { app } = buildApp({ role: 'admin', repo: makeMultiRepoStub() })
      const res = await app.request('/role:editor', putRequest(validLayout))
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean }
      expect(body.ok).toBe(true)
    })

    it('editor cannot write role:editor (403)', async () => {
      const { app } = buildApp({ role: 'editor', repo: makeMultiRepoStub() })
      const res = await app.request('/role:editor', putRequest(validLayout))
      expect(res.status).toBe(403)
    })

    it('rejects an unknown scope with a 400 invalid-scope problem', async () => {
      const { app } = buildApp({ role: 'admin', repo: makeMultiRepoStub() })
      const res = await app.request('/role:ghost', putRequest(validLayout))
      expect(res.status).toBe(400)
      const body = await res.json() as { type: string }
      expect(body.type).toContain('invalid-scope')
    })

    it('removes the stored row for a scope', async () => {
      const repo = makeMultiRepoStub({ 'role:editor': validLayout })
      const { app } = buildApp({ role: 'admin', repo })
      const res = await app.request('/role:editor', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await repo.get('role:editor')).toBeNull()
    })
  })

  describe('GET /:scope', () => {
    it('returns the raw stored layout for a scope', async () => {
      const repo = makeMultiRepoStub({ 'role:editor': validLayout })
      const { app } = buildApp({ role: 'admin', repo })
      const res = await app.request('/role:editor')
      const body = await res.json() as { scope: string; layout: DashboardLayout | null }
      expect(body.scope).toBe('role:editor')
      expect(body.layout).toEqual(validLayout)
    })

    it('returns layout: null for an unstored scope', async () => {
      const { app } = buildApp({ role: 'admin', repo: makeMultiRepoStub() })
      const res = await app.request('/role:editor')
      expect(await res.json()).toEqual({ scope: 'role:editor', layout: null })
    })

    it('returns 403 for an editor', async () => {
      const { app } = buildApp({ role: 'editor', repo: makeMultiRepoStub() })
      const res = await app.request('/role:editor')
      expect(res.status).toBe(403)
    })
  })

  describe('GET /scopes', () => {
    it('lists the closed set of scopes annotated with stored state', async () => {
      const repo = makeMultiRepoStub({ default: validLayout, 'role:editor': validLayout })
      const { app } = buildApp({ role: 'admin', repo })
      const res = await app.request('/scopes')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual([
        { scope: 'default', stored: true },
        { scope: 'role:admin', stored: false },
        { scope: 'role:editor', stored: true },
      ])
    })

    it('returns 403 for an editor', async () => {
      const { app } = buildApp({ role: 'editor', repo: makeMultiRepoStub() })
      const res = await app.request('/scopes')
      expect(res.status).toBe(403)
    })
  })
})
