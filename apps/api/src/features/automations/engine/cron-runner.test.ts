// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Automation, IAutomationRepository, ContentRepository, Seed, IIdGenerator } from '@beechcms/core'
import { runCronAutomations } from './cron-runner'
import type { CronRunnerDeps } from './cron-runner'

vi.mock('../executors', () => ({
  executeAction: vi.fn().mockResolvedValue(undefined),
}))

import { executeAction } from '../executors'
const executeActionMock = executeAction as ReturnType<typeof vi.fn>

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

const STUB_ID_GENERATOR: IIdGenerator = {
  uuid: () => 'test-uuid',
  isValid: (v: unknown): v is string => typeof v === 'string',
}

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto_01',
    seed_slug: 'posts',
    name: 'every-minute',
    enabled: true,
    triggers: [{ event: 'cron' as const, cron: '* * * * *' }],
    trigger_conditions: null,
    actions: [{ type: 'webhook', url: 'https://example.com/hook' }],
    created_at: 0,
    updated_at: 0,
    ...overrides,
  }
}

function makeDeps(overrides: Partial<CronRunnerDeps> = {}): CronRunnerDeps & {
  listSpy: ReturnType<typeof vi.fn>
  findActiveSpy: ReturnType<typeof vi.fn>
} {
  const listSpy = vi.fn().mockResolvedValue({ items: [{ id: 'e1', title: 'Hello' }], total: 1 })
  const findActiveSpy = vi.fn().mockResolvedValue([makeAutomation()])

  return {
    automationRepository: {
      findActive: findActiveSpy,
      list: vi.fn(), findById: vi.fn(), create: vi.fn(),
      update: vi.fn(), toggle: vi.fn(), delete: vi.fn(),
    } as unknown as IAutomationRepository,
    contentRepository: { findMany: listSpy } as unknown as ContentRepository,
    getSeed: (slug: string) => slug === 'posts' ? SEED : null,
    env: {},
    idGenerator: STUB_ID_GENERATOR,
    listSpy,
    findActiveSpy,
    ...overrides,
  }
}

describe('runCronAutomations', () => {
  beforeEach(() => {
    executeActionMock.mockReset()
    executeActionMock.mockResolvedValue(undefined)
  })

  it('calls findActive with ("*", "cron")', async () => {
    const deps = makeDeps()
    await runCronAutomations(deps, TICK)
    expect(deps.findActiveSpy).toHaveBeenCalledWith('*', 'cron')
  })

  it('batch actions (webhook, send_mail) run once per automation with batch context', async () => {
    const entries = [{ id: 'e1', title: 'A' }, { id: 'e2', title: 'B' }]
    const deps = makeDeps()
    deps.listSpy.mockResolvedValue({ items: entries, total: 2 })

    await runCronAutomations(deps, TICK)

    expect(executeActionMock).toHaveBeenCalledTimes(1)
    const [, ctx] = executeActionMock.mock.calls[0]
    // entry is the first entry (for backwards compat); batch count lives in context
    expect(ctx.entry).toMatchObject({ id: 'e1', title: 'A' })
    expect(ctx.context).toBeDefined()
  })

  it('per-entry actions (edit_field, create_entry) run once per matching entry', async () => {
    const entries = [{ id: 'e1' }, { id: 'e2' }]
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([makeAutomation({ actions: [{ type: 'edit_field', field: 'title', value: 'updated' }] })])
    deps.listSpy.mockResolvedValue({ items: entries, total: 2 })

    await runCronAutomations(deps, TICK)

    expect(executeActionMock).toHaveBeenCalledTimes(2)
    expect(executeActionMock.mock.calls[0][1].entry).toMatchObject({ id: 'e1' })
    expect(executeActionMock.mock.calls[1][1].entry).toMatchObject({ id: 'e2' })
  })

  it('skips non-matching cron expression, runs matching one', async () => {
    const matchingAuto = makeAutomation({ id: 'auto_match', triggers: [{ event: 'cron', cron: '* * * * *' }] })
    const nonMatchingAuto = makeAutomation({ id: 'auto_skip', triggers: [{ event: 'cron', cron: '30 9 * * *' }] })
    const entries = [{ id: 'e1' }, { id: 'e2' }]

    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([matchingAuto, nonMatchingAuto])
    deps.listSpy.mockResolvedValue({ items: entries, total: 2 })

    await runCronAutomations(deps, TICK)

    // webhook = batch, runs once for the matching automation only
    expect(executeActionMock).toHaveBeenCalledTimes(1)
  })

  it('passes trigger_conditions as translated filters to repository.findMany', async () => {
    const auto = makeAutomation({
      trigger_conditions: {
        kind: 'group',
        op: 'AND',
        children: [
          { kind: 'predicate', left: { kind: 'ref', key: 'this.title' }, op: 'eq', right: { kind: 'literal', value: 'Hello' } },
        ],
      },
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
      trigger_conditions: {
        kind: 'group',
        op: 'AND',
        children: [
          { kind: 'predicate', left: { kind: 'ref', key: 'this.count' }, op: 'gt', right: { kind: 'literal', value: 5 } },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.published' }, op: 'eq', right: { kind: 'literal', value: true } },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.publish_date' }, op: 'isempty' },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.tags_list' }, op: 'isnotempty' },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.meta_json' }, op: 'eq', right: { kind: 'literal', value: '{}' } },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.body_rich' }, op: 'contains', right: { kind: 'literal', value: 'hello' } },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.status' }, op: 'eq', right: { kind: 'literal', value: 'draft' } },
          { kind: 'predicate', left: { kind: 'ref', key: 'this.unknown_custom' }, op: 'eq', right: { kind: 'literal', value: 'test' } },
        ],
      },
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

    expect(executeActionMock).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith('[cron] unknown seed', expect.anything())
    warnSpy.mockRestore()
  })

  it('continues processing remaining per-entry actions when one entry throws', async () => {
    const entries = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }]
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([makeAutomation({ actions: [{ type: 'edit_field', field: 'title', value: 'x' }] })])
    deps.listSpy.mockResolvedValue({ items: entries, total: 3 })
    executeActionMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)

    await runCronAutomations(deps, TICK)

    expect(executeActionMock).toHaveBeenCalledTimes(3)
    expect(errorSpy).toHaveBeenCalledWith('[cron] entry action failed', expect.anything())
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
    // auto2 still processed (webhook = batch, 1 call)
    expect(executeActionMock).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('logs error and returns gracefully when findActive throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()
    deps.findActiveSpy.mockRejectedValueOnce(new Error('no such table'))

    await expect(runCronAutomations(deps, TICK)).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[cron] Failed to fetch automations'),
      expect.anything(),
    )
    expect(executeActionMock).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('resolves quietly with zero calls when no active automations exist', async () => {
    const deps = makeDeps()
    deps.findActiveSpy.mockResolvedValue([])

    await expect(runCronAutomations(deps, TICK)).resolves.toBeUndefined()
    expect(executeActionMock).not.toHaveBeenCalled()
  })

  it('skips automation silently when entries list is empty', async () => {
    const deps = makeDeps()
    deps.listSpy.mockResolvedValue({ items: [], total: 0 })

    await runCronAutomations(deps, TICK)

    expect(executeActionMock).not.toHaveBeenCalled()
  })
})
