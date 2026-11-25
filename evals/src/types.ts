// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

export type EvalVariant = 'v1' | 'v2'
export type TaskArea = 'schema' | 'content' | 'trash' | 'intent' | 'automations' | 'business-rules'

export interface TaskVerdict {
  success: boolean
  /** One short sentence: what was checked and what was found. */
  detail: string
}

/** One finished agent run, as parsed from the stream-json transcript. */
export interface RunMetrics {
  status: 'completed' | 'agent_error' | 'timeout' | 'harness_error'
  /** `result.num_turns`; null when no result event arrived. */
  turns: number | null
  /** input + cache_creation + cache_read tokens of `result.usage`; null when no result event. */
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  costUsd: number | null
  durationMs: number
  /** Tool name → number of `tool_use` blocks, keys sorted ascending. */
  toolCalls: Record<string, number>
  /** Final assistant text (`result.result`); null when absent. */
  finalText: string | null
  /** Why the run is `harness_error` or `agent_error`; null otherwise. */
  error: string | null
}

export interface TaskResult {
  taskId: string
  variant: EvalVariant
  metrics: RunMetrics
  /** null when metrics.status is 'harness_error' (the check never ran). */
  verdict: TaskVerdict | null
  /** Transcript path relative to the repo root. */
  transcript: string
}

export interface VariantSummary {
  variant: EvalVariant
  runs: number
  successes: number
  /** Medians over runs with a non-null value; null when none. */
  medianTurns: number | null
  medianInputTokens: number | null
  medianOutputTokens: number | null
  totalCostUsd: number
}

export interface EvalReport {
  version: 1
  startedAt: string            // ISO-8601
  gitCommit: string            // short sha
  model: string                // the --model value
  claudeVersion: string        // `system/init` claude_code_version, first run that reported it
  v1Package: '@beechcms/mcp@1.2.0'
  tasks: Array<{ id: string; title: string; area: TaskArea; expectV1: boolean }>
  results: TaskResult[]
  summary: VariantSummary[]    // order: v1, v2 (only variants that ran)
}
