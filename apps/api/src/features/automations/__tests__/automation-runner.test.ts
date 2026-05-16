import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AutomationRunner } from '../automation-runner'
import type { AutomationRunnerDeps } from '../automation-runner'
import type { IAutomationRepository, ContentRepository, Seed, IIdGenerator, Automation } from '@beechcms/core'
import { resolveVarAccess } from '../var-access-resolver'
import { parseTemplateKey } from '../template-grammar'

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    seed_slug: 'posts',
    name: 'Test Automation',
    enabled: true,
    triggers: [{ event: 'create' as const }],
    trigger_conditions: null,
    actions: [],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<AutomationRunnerDeps> = {}): AutomationRunnerDeps {
  return {
    automationRepository: {
      findActive: vi.fn().mockResolvedValue([]),
    } as unknown as IAutomationRepository,
    contentRepository: {} as ContentRepository,
    getSeed: vi.fn().mockReturnValue({ slug: 'posts', branches: [] } as unknown as Seed),
    idGenerator: { uuid: vi.fn().mockReturnValue('new-id') } as unknown as IIdGenerator,
    env: {},
    ...overrides,
  }
}

describe('AutomationRunner', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('does nothing when no automations match', async () => {
    const deps = makeDeps()
    const runner = new AutomationRunner(deps)
    await runner.run({ seedSlug: 'posts', event: 'create', entry: { id: '1' } })
    expect(deps.automationRepository.findActive).toHaveBeenCalledWith('posts', 'create')
  })

  it('does nothing when getSeed returns null', async () => {
    const deps = makeDeps({ getSeed: vi.fn().mockReturnValue(null) })
    const runner = new AutomationRunner(deps)
    await runner.run({ seedSlug: 'unknown', event: 'create', entry: { id: '1' } })
    expect(deps.automationRepository.findActive).not.toHaveBeenCalled()
  })

  it('skips actions when trigger conditions are not met', async () => {
    const automation = makeAutomation({
      trigger_conditions: {
        kind: 'group',
        op: 'AND',
        children: [{ kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'published' } }],
      },
      actions: [{ type: 'webhook', url: 'https://example.com' }],
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const deps = makeDeps({
      automationRepository: {
        findActive: vi.fn().mockResolvedValue([automation]),
      } as unknown as IAutomationRepository,
    })
    const runner = new AutomationRunner(deps)
    await runner.run({ seedSlug: 'posts', event: 'create', entry: { id: '1', status: 'draft' } })

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('continues to next action when first action throws', async () => {
    const secondActionFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue({ ok: true }),
    )

    const automation = makeAutomation({
      actions: [
        { type: 'webhook', url: 'https://fail.example.com' },
        { type: 'webhook', url: 'https://success.example.com' },
      ],
    })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const deps = makeDeps({
      automationRepository: {
        findActive: vi.fn().mockResolvedValue([automation]),
      } as unknown as IAutomationRepository,
    })
    const runner = new AutomationRunner(deps)
    await runner.run({ seedSlug: 'posts', event: 'create', entry: { id: '1', status: 'published' } })

    expect(consoleSpy).toHaveBeenCalledWith('[automations] action failed', expect.objectContaining({
      automationId: 'auto-1',
      actionType: 'webhook',
    }))

    // fetch was called twice (first failed, second succeeded)
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls
    expect(fetchCalls).toHaveLength(2)
    expect(fetchCalls[1][0]).toBe('https://success.example.com')
  })

  it('runs actions when conditions pass', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const automation = makeAutomation({
      trigger_conditions: {
        kind: 'group',
        op: 'AND',
        children: [{ kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'published' } }],
      },
      actions: [{ type: 'webhook', url: 'https://example.com/hook' }],
    })

    const deps = makeDeps({
      automationRepository: {
        findActive: vi.fn().mockResolvedValue([automation]),
      } as unknown as IAutomationRepository,
    })
    const runner = new AutomationRunner(deps)
    await runner.run({ seedSlug: 'posts', event: 'create', entry: { id: '1', status: 'published' } })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://example.com/hook')
  })
})

// ── Sprint 07: resolveVarAccess unit tests ─────────────────────────────────────

describe('resolveVarAccess (Sprint 07)', () => {
  function makeCollectionVar(items: Array<Record<string, unknown>>) {
    const out: Record<string, unknown> = {
      count: items.length,
      firstone: items[0] ?? null,
      lastone: items[items.length - 1] ?? null,
      sum: {},
      avg: {},
      min: {},
      max: {},
      pluck: {},
    }
    Object.defineProperty(out, '_items', { value: items, enumerable: false })
    return out
  }

  const items = [
    { id: 'a', status: 'paid', amount: 100, created_at: 1 },
    { id: 'b', status: 'draft', amount: 50, created_at: 2 },
    { id: 'c', status: 'paid', amount: 200, created_at: 3 },
  ]

  it('array[id] selector filters _items and rebuilds collection', () => {
    const variables = { ordini: makeCollectionVar(items) }
    const parsed = parseTemplateKey('ordini.array[a,c].count')!
    expect(parsed.kind).toBe('var_access')
    const result = resolveVarAccess(parsed as any, variables)
    expect(result).toBe(2)
  })

  it('inline condition (status=paid) reduces count', () => {
    const variables = { ordini: makeCollectionVar(items) }
    const parsed = parseTemplateKey('ordini.count.(status=paid)')!
    const result = resolveVarAccess(parsed as any, variables)
    expect(result).toBe(2)
  })

  it('conditions on firstone.id return undefined when record fails predicate', () => {
    const variables = { ordini: makeCollectionVar(items) }
    // firstone is items[0] which has status=paid, so (status=draft) should fail
    const parsed = parseTemplateKey('ordini.firstone.status.(status=draft)')!
    const result = resolveVarAccess(parsed as any, variables)
    // firstone.status = 'paid', condition says status=draft → undefined
    expect(result).toBeUndefined()
  })

  it('returns undefined when variable is missing and calls onMissing', () => {
    const onMissing = vi.fn()
    const parsed = parseTemplateKey('missing.count.(status=paid)')!
    const result = resolveVarAccess(parsed as any, {}, onMissing)
    expect(result).toBeUndefined()
    expect(onMissing).toHaveBeenCalledWith('missing')
  })
})
