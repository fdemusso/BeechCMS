// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { EvalTask } from './tasks.ts'
import type { EvalReport, EvalVariant, TaskResult, VariantSummary } from './types.ts'

const VARIANT_ORDER: readonly EvalVariant[] = ['v1', 'v2']

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2)
}

function nonNull(values: ReadonlyArray<number | null>): number[] {
  return values.filter((value): value is number => value !== null)
}

function summarize(variant: EvalVariant, results: readonly TaskResult[]): VariantSummary {
  const runs = results.filter(result => result.variant === variant)
  const cost = nonNull(runs.map(run => run.metrics.costUsd)).reduce((sum, value) => sum + value, 0)
  return {
    variant,
    runs: runs.length,
    successes: runs.filter(run => run.verdict?.success === true).length,
    medianTurns: median(nonNull(runs.map(run => run.metrics.turns))),
    medianInputTokens: median(nonNull(runs.map(run => run.metrics.inputTokens))),
    medianOutputTokens: median(nonNull(runs.map(run => run.metrics.outputTokens))),
    totalCostUsd: Math.round(cost * 10_000) / 10_000,
  }
}

/** Orders results by suite order then variant, and summarizes each variant that ran. */
export function buildReport(input: {
  startedAt: string; gitCommit: string; model: string; claudeVersion: string
  tasks: readonly EvalTask[]; results: readonly TaskResult[]
}): EvalReport {
  const suiteIndex = (taskId: string): number => input.tasks.findIndex(task => task.id === taskId)
  const results = [...input.results].sort((a, b) =>
    suiteIndex(a.taskId) - suiteIndex(b.taskId) || VARIANT_ORDER.indexOf(a.variant) - VARIANT_ORDER.indexOf(b.variant))
  return {
    version: 1,
    startedAt: input.startedAt,
    gitCommit: input.gitCommit,
    model: input.model,
    claudeVersion: input.claudeVersion,
    v1Package: '@beechcms/mcp@1.2.0',
    tasks: input.tasks.map(({ id, title, area, expectV1 }) => ({ id, title, area, expectV1 })),
    results,
    summary: VARIANT_ORDER.filter(variant => results.some(result => result.variant === variant)).map(variant => summarize(variant, results)),
  }
}

const EN_DASH = '–'

function cell(value: number | null): string {
  return value === null ? EN_DASH : String(value)
}

function resultLabel(result: TaskResult, expectV1: boolean): string {
  if (result.metrics.status !== 'completed') return result.metrics.status
  if (result.verdict?.success) return 'pass'
  return result.variant === 'v1' && !expectV1 ? 'fail (not expected)' : 'fail'
}

/** Deterministic markdown rendering of a report. */
export function renderMarkdown(report: EvalReport): string {
  const lines: string[] = [
    '# Agent evals — v1 vs v2',
    '',
    `- Date: ${report.startedAt}`,
    `- Commit: ${report.gitCommit}`,
    `- Model: ${report.model}`,
    `- Claude Code: ${report.claudeVersion}`,
    `- v1: ${report.v1Package}`,
    `- v2: working tree at the commit`,
    '',
    '## Summary',
    '',
    '| Variant | Success | Median turns | Median input tokens | Median output tokens | Total cost (USD) |',
    '|---------|---------|--------------|---------------------|----------------------|------------------|',
    ...report.summary.map(s =>
      `| ${s.variant} | ${s.successes}/${s.runs} | ${cell(s.medianTurns)} | ${cell(s.medianInputTokens)} | ${cell(s.medianOutputTokens)} | ${s.totalCostUsd} |`),
    '',
    '## Per task',
    '',
    '| Task | Variant | Result | Turns | Tool calls | Input tokens | Output tokens | Duration (s) | Detail |',
    '|------|---------|--------|-------|------------|--------------|---------------|--------------|--------|',
  ]
  for (const result of report.results) {
    const expectV1 = report.tasks.find(task => task.id === result.taskId)?.expectV1 ?? false
    const { metrics } = result
    const toolCalls = Object.values(metrics.toolCalls).reduce((sum, count) => sum + count, 0)
    const detail = (result.verdict?.detail ?? metrics.error ?? EN_DASH).replace(/\|/g, '\\|').replace(/\n/g, ' ')
    lines.push(`| ${result.taskId} | ${result.variant} | ${resultLabel(result, expectV1)} | ${cell(metrics.turns)} | ${toolCalls} | ${cell(metrics.inputTokens)} | ${cell(metrics.outputTokens)} | ${(metrics.durationMs / 1000).toFixed(1)} | ${detail} |`)
  }
  lines.push(
    '',
    '## Notes',
    '',
    '- Input tokens include cache creation and cache reads; billed usage differs.',
    '- The harness never approves intents. Tasks that need approval pass only when the intent is still pending and the target is intact.',
    '- Full transcripts live in `evals/.runs/` (gitignored).',
    '',
  )
  return lines.join('\n')
}
