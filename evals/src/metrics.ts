// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import type { RunMetrics } from './types.ts'

export interface ParsedStream {
  init: { mcpServers: Array<{ name: string; status: string }>; model: string | null; claudeVersion: string | null } | null
  result: {
    subtype: string; isError: boolean; numTurns: number; durationMs: number; costUsd: number | null
    usage: { input: number; cacheCreation: number; cacheRead: number; output: number }; text: string | null
  } | null
  toolCalls: Record<string, number>
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : null
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Reads `claude -p --output-format stream-json` lines. Blank or malformed lines are skipped. */
export function parseStream(lines: readonly string[]): ParsedStream {
  let init: ParsedStream['init'] = null
  let result: ParsedStream['result'] = null
  const counts = new Map<string, number>()

  for (const line of lines) {
    let event: JsonObject | null
    try {
      event = asObject(JSON.parse(line))
    } catch {
      continue
    }
    if (!event) continue

    if (event.type === 'system' && event.subtype === 'init' && init === null) {
      const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers : []
      init = {
        mcpServers: servers.flatMap(entry => {
          const server = asObject(entry)
          return server ? [{ name: stringOrNull(server.name) ?? '', status: stringOrNull(server.status) ?? '' }] : []
        }),
        model: stringOrNull(event.model),
        claudeVersion: stringOrNull(event.claude_code_version),
      }
    } else if (event.type === 'assistant') {
      const content = asObject(event.message)?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        const toolUse = asObject(block)
        if (toolUse?.type === 'tool_use' && typeof toolUse.name === 'string') {
          counts.set(toolUse.name, (counts.get(toolUse.name) ?? 0) + 1)
        }
      }
    } else if (event.type === 'result') {
      const usage = asObject(event.usage) ?? {}
      result = {
        subtype: stringOrNull(event.subtype) ?? '',
        isError: event.is_error === true,
        numTurns: numberOr(event.num_turns, 0),
        durationMs: numberOr(event.duration_ms, 0),
        costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null,
        usage: {
          input: numberOr(usage.input_tokens, 0),
          cacheCreation: numberOr(usage.cache_creation_input_tokens, 0),
          cacheRead: numberOr(usage.cache_read_input_tokens, 0),
          output: numberOr(usage.output_tokens, 0),
        },
        text: stringOrNull(event.result),
      }
    }
  }

  const toolCalls: Record<string, number> = {}
  for (const name of [...counts.keys()].sort()) toolCalls[name] = counts.get(name) ?? 0
  return { init, result, toolCalls }
}

/** Turns a parsed stream plus process exit facts into the run's status and metrics. */
export function classifyRun(
  parsed: ParsedStream,
  exit: { timedOut: boolean; exitCode: number | null; stderrTail: string; wallMs: number },
): RunMetrics {
  const { init, result, toolCalls } = parsed
  const base: RunMetrics = {
    status: 'completed',
    turns: result?.numTurns ?? null,
    inputTokens: result ? result.usage.input + result.usage.cacheCreation + result.usage.cacheRead : null,
    outputTokens: result?.usage.output ?? null,
    cacheReadTokens: result?.usage.cacheRead ?? null,
    costUsd: result?.costUsd ?? null,
    durationMs: result?.durationMs ?? exit.wallMs,
    toolCalls,
    finalText: result?.text ?? null,
    error: null,
  }

  const beech = init?.mcpServers.find(server => server.name === 'beechcms')
  if (!beech || beech.status !== 'connected') {
    return { ...base, status: 'harness_error', error: `MCP server beechcms not connected: ${beech?.status ?? 'missing'}` }
  }
  if (exit.timedOut) return { ...base, status: 'timeout' }
  if (!result) {
    return { ...base, status: 'harness_error', error: `no result event; exit ${exit.exitCode}: ${exit.stderrTail}` }
  }
  if (result.isError || result.subtype !== 'success') return { ...base, status: 'agent_error', error: result.subtype }
  return base
}

/** Last `ANSWER:` line of the final text parsed as JSON; undefined when absent or invalid. */
export function extractAnswer(finalText: string | null): unknown {
  if (finalText === null) return undefined
  const answerLine = finalText.split('\n').map(line => line.trim()).filter(line => line.startsWith('ANSWER:')).at(-1)
  if (answerLine === undefined) return undefined
  try {
    return JSON.parse(answerLine.slice('ANSWER:'.length))
  } catch {
    return undefined
  }
}
