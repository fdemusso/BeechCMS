import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Automation, IAutomationRepository, IAutomationRunner, ContentRepository, Seed, AutomationEventPayload } from '@beechcms/core'
import { runCronAutomations } from '../cron-runner'
import type { CronRunnerDeps } from '../cron-runner'

// 2026-05-14T09:00:00Z → minute=0, hour=9, dow=4 (Thursday)
const TICK = new Date('2026-05-14T09:00:00Z').getTime()

const SEED: Seed = {
  slug: 'posts',
  label: 'Post',
  displayNameAlias: 'title',
  branches: [
    { id: 'br_01', alias: 'title', type: 'text', label: 'Title' },
    { id: 'br_02', alias: 'count', type: 'number', label: 'Count' },
    { id: 'br_03', alias: 'published', type: 'boolean', label: 'Published' },
    { id: 'br_04', alias: 'publish_date', type: 'date', label: 'Publish Date' },
    { id: 'br_05', alias: 'tags_list', type: 'tags', label: 'Tags' },
    { id: 'br_06', alias: 'meta_json', type: 'json', label: 'Meta JSON' },
    { id: 'br_07', alias: 'body_rich', type: 'richtext', label: 'Body' },
  ],
}

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto_01',
    seed_slug: 'posts',
    name: 'every-minute',
    enabled: true,
    trigger_event: 'cron',
    trigger_cron: '* * * * *',
    trigger_conditions: null,
    actions: [{ type: 'webhook', url: 'https://example.com/hook' }],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<CronRunnerDeps> = {}): CronRunnerDeps & {
  runSpy: ReturnType<typeof vi.fn>
  listSpy: ReturnType<typeof vi.fn>
  findActiveSpy: ReturnType<typeof vi.fn>
} {
  const runSpy = vi.fn().mockResolvedValue(undefined)
  const listSpy = vi.fn().mockResolvedValue({ items: [{ id: 'e1', title: 'Hello' }], total: 1 })
  const findActiveSpy = vi.fn().mockResolvedValue([makeAutomation()])

  return {
    automationRepository: {
      findActive: findActiveSpy,
      list: vi.fn(), findById: vi.fn(), create: vi.fn(),
      update: vi.fn(), toggle: vi.fn(), delete: vi.fn(),
    } as unknown as IAutomationRepository,
    runner: { run: runSpy } as unknown as IAutomationRunner,
    contentRepository: { findMany: listSpy } as unknown as ContentRepository,
    getSeed: (slug: string) => slug === 'posts' ? SEED : null,
    runSpy,
    listSpy,
    findActiveSpy,
    ...overrides,
  }
}

describe('runCronAutomations', () => {
  it('calls findActive with ("*", "cron")', async () => {
    const deps = makeDeps()
    await runCronAutomations(deps, TICK)
    expect(deps.findActiveSpy).toHaveBeenCalledWith('*', 'cron')
  })

  it('invokes runner once per matching entry when one of two automations matches the tick', async () => {
    const matchingAuto = makeAutomation({ id: 'auto_match', trigger_cron: '* * * * *' })
    // 0 9 * * * also matches TICK (minute=0, hour=9) — wait, both match
    // Use a non-matching cron for the second one
    const nonMatchingAuto = makeAutomation({ id: 'auto_skip', trigger_cron: '30 9 * * *' })
    const entries = [{ id: 'e1' }, { id: 'e2' }]

    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([matchingAuto, nonMatchingAuto])
    deps.listSpy.mockResolvedValue({ items: entries, total: 2 })

    await runCronAutomations(deps, TICK)

    // Only the matching automation fires, one call per entry
    expect(deps.runSpy).toHaveBeenCalledTimes(2)
    expect(deps.runSpy).toHaveBeenCalledWith(
      expect.objectContaining({ seedSlug: 'posts', event: 'cron', entry: entries[0] })
    )
  })

  it('passes trigger_conditions as translated filters to repository.findMany', async () => {
    const auto = makeAutomation({
      trigger_conditions: [{ field: 'title', op: 'eq', value: 'Hello' }],
    })
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([auto])

    await runCronAutomations(deps, TICK)

    const call = deps.listSpy.mock.calls[0]
    const options = call[1]
    expect(options.filters).toEqual([
      { column: 'title', type: 'text', conditions: [{ op: 'eq', value: 'Hello' }] },
    ])
  })

  it('maps all branch types, system columns, unknown columns, and special operators correctly', async () => {
    const auto = makeAutomation({
      trigger_conditions: [
        { field: 'count', op: 'gt', value: 5 },
        { field: 'published', op: 'eq', value: true },
        { field: 'publish_date', op: 'isempty', value: null },
        { field: 'tags_list', op: 'isnotempty', value: null },
        { field: 'meta_json', op: 'eq', value: '{}' },
        { field: 'body_rich', op: 'contains', value: 'hello' },
        { field: 'status', op: 'eq', value: 'draft' }, // system column
        { field: 'unknown_custom', op: 'eq', value: 'test' }, // fallback text
      ],
    })
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([auto])

    await runCronAutomations(deps, TICK)

    const call = deps.listSpy.mock.calls[0]
    expect(call[1].filters).toEqual([
      { column: 'count', type: 'number', conditions: [{ op: 'gt', value: 5 }] },
      { column: 'published', type: 'boolean', conditions: [{ op: 'eq', value: true }] },
      { column: 'publish_date', type: 'date', conditions: [{ op: 'is_empty', value: null }] },
      { column: 'tags_list', type: 'tags', conditions: [{ op: 'is_not_empty', value: null }] },
      { column: 'meta_json', type: 'json', conditions: [{ op: 'eq', value: '{}' }] },
      { column: 'body_rich', type: 'text', conditions: [{ op: 'contains', value: 'hello' }] },
      { column: 'status', type: 'system', conditions: [{ op: 'eq', value: 'draft' }] },
      { column: 'unknown_custom', type: 'text', conditions: [{ op: 'eq', value: 'test' }] },
    ])
  })

  it('logs warning and skips when getSeed returns null', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const auto = makeAutomation({ seed_slug: 'unknown' })
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([auto])

    await runCronAutomations(deps, TICK)

    expect(deps.runSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith('[cron] unknown seed', expect.anything())
    warnSpy.mockRestore()
  })

  it('continues processing remaining entries when runner.run throws on one', async () => {
    const entries = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()
    deps.listSpy.mockResolvedValue({ items: entries, total: 3 })
    deps.runSpy
      .mockResolvedValueOnce(undefined)   // e1 ok
      .mockRejectedValueOnce(new Error('boom'))  // e2 throws
      .mockResolvedValueOnce(undefined)   // e3 ok

    await runCronAutomations(deps, TICK)

    expect(deps.runSpy).toHaveBeenCalledTimes(3)
    expect(errorSpy).toHaveBeenCalledWith('[cron] entry processing failed', expect.anything())
    errorSpy.mockRestore()
  })

  it('logs and continues to next automation when repository.findMany throws', async () => {
    const auto1 = makeAutomation({ id: 'auto_01' })
    const auto2 = makeAutomation({ id: 'auto_02' })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([auto1, auto2])
    deps.listSpy
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce({ items: [{ id: 'e1' }], total: 1 })

    await runCronAutomations(deps, TICK)

    expect(errorSpy).toHaveBeenCalledWith('[cron] fetch entries failed', expect.anything())
    // auto2 still processed
    expect(deps.runSpy).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('resolves quietly with zero calls when no active automations exist', async () => {
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([])

    await expect(runCronAutomations(deps, TICK)).resolves.toBeUndefined()
    expect(deps.runSpy).not.toHaveBeenCalled()
  })
})
