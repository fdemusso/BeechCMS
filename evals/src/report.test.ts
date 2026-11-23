// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { buildReport, renderMarkdown } from './report.ts'
import type { EvalTask } from './tasks.ts'
import type { EvalVariant, RunMetrics, TaskResult } from './types.ts'

const task = (id: string, expectV1: boolean): EvalTask => ({
  id, title: `Title of ${id}`, area: 'content', expectV1,
  prepare: async () => ({ prompt: '', verify: async () => ({ success: true, detail: '' }) }),
})
const TASKS = [task('first', true), task('second', false)]

const metrics = (overrides: Partial<RunMetrics> = {}): RunMetrics => ({
  status: 'completed', turns: 3, inputTokens: 1_000, outputTokens: 100, cacheReadTokens: 500, costUsd: 0.1,
  durationMs: 5_000, toolCalls: { Bash: 2, Read: 1 }, finalText: null, error: null, ...overrides,
})
const result = (taskId: string, variant: EvalVariant, success: boolean, overrides: Partial<RunMetrics> = {}): TaskResult => ({
  taskId, variant, metrics: metrics(overrides), verdict: { success, detail: success ? 'ok' : 'broken' }, transcript: `evals/.runs/x/${variant}/${taskId}.jsonl`,
})
const meta = { startedAt: '2026-11-21T18:00:00.000Z', gitCommit: 'abc1234', model: 'sonnet', claudeVersion: '2.1.330' }

describe('buildReport', () => {
  it('results arrive shuffled and come out in suite order with v1 before v2', () => {
    const report = buildReport({ ...meta, tasks: TASKS, results: [result('second', 'v2', true), result('first', 'v2', true), result('second', 'v1', false), result('first', 'v1', true)] })

    expect(report.results.map(r => `${r.taskId}/${r.variant}`)).toEqual(['first/v1', 'first/v2', 'second/v1', 'second/v2'])
    expect(report.summary.map(s => s.variant)).toEqual(['v1', 'v2'])
  })

  it('summary counts successes and takes medians over non-null values only', () => {
    const report = buildReport({
      ...meta, tasks: TASKS,
      results: [
        result('first', 'v1', true, { turns: 2, costUsd: 0.1234 }),
        result('second', 'v1', false, { turns: 9, costUsd: 0.2 }),
        { ...result('second', 'v1', false), verdict: null, metrics: metrics({ status: 'harness_error', turns: null, inputTokens: null, outputTokens: null, costUsd: null }) },
      ],
    })

    expect(report.summary).toEqual([{ variant: 'v1', runs: 3, successes: 1, medianTurns: 6, medianInputTokens: 1_000, medianOutputTokens: 100, totalCostUsd: 0.3234 }])
  })

  it('an even number of runs takes the rounded mean of the two middle values', () => {
    const report = buildReport({
      ...meta, tasks: TASKS,
      results: [result('first', 'v2', true, { turns: 3 }), result('second', 'v2', true, { turns: 6 })],
    })

    expect(report.summary[0]?.medianTurns).toBe(5)
  })
})

describe('renderMarkdown', () => {
  const report = buildReport({ ...meta, tasks: TASKS, results: [result('first', 'v1', true), result('second', 'v1', false), result('second', 'v2', true)] })

  it('renders one per-task row per result and one summary row per variant', () => {
    const markdown = renderMarkdown(report)

    expect(markdown.match(/^\| (first|second) \|/gm)).toHaveLength(3)
    expect(markdown.match(/^\| v[12] \|/gm)).toHaveLength(2)
    expect(markdown).toContain('| first | v1 | pass | 3 | 3 | 1000 | 100 | 5.0 | ok |')
  })

  it('a failed v1 run on a task not expected for v1 is marked not expected', () => {
    const markdown = renderMarkdown(report)

    expect(markdown).toContain('| second | v1 | fail (not expected) |')
  })

  it('null metrics render as an en dash', () => {
    const crashed = buildReport({ ...meta, tasks: TASKS, results: [{ ...result('first', 'v1', false), verdict: null, metrics: metrics({ status: 'harness_error', turns: null, inputTokens: null, outputTokens: null, error: 'boom' }) }] })

    const markdown = renderMarkdown(crashed)

    expect(markdown).toContain('| first | v1 | harness_error | – | 3 | – | – | 5.0 | boom |')
  })

  it('the same report renders byte-identical markdown twice', () => {
    const first = renderMarkdown(report)
    const second = renderMarkdown(report)

    expect(second).toBe(first)
  })
})
