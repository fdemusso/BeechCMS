// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, expect, it } from 'vitest'
import { classifyRun, extractAnswer, parseStream, type ParsedStream } from './metrics.ts'

const initLine = (status: string) => JSON.stringify({
  type: 'system', subtype: 'init', model: 'claude-sonnet', claude_code_version: '2.1.330',
  mcp_servers: [{ name: 'beechcms', status }],
})
const assistantLine = (...toolNames: string[]) => JSON.stringify({
  type: 'assistant', message: { content: toolNames.map(name => ({ type: 'tool_use', name, input: {} })) },
})
const resultLine = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  type: 'result', subtype: 'success', is_error: false, num_turns: 4, duration_ms: 9_000, total_cost_usd: 0.05,
  usage: { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 300, output_tokens: 50 },
  result: 'done',
  ...overrides,
})
const exitFacts = { timedOut: false, exitCode: 0, stderrTail: '', wallMs: 12_000 }

describe('parseStream', () => {
  it('a result event yields turns, usage, cost and final text', () => {
    const parsed = parseStream([initLine('connected'), resultLine()])

    expect(parsed.result).toEqual({
      subtype: 'success', isError: false, numTurns: 4, durationMs: 9_000, costUsd: 0.05,
      usage: { input: 100, cacheCreation: 200, cacheRead: 300, output: 50 }, text: 'done',
    })
    expect(parsed.init).toEqual({ mcpServers: [{ name: 'beechcms', status: 'connected' }], model: 'claude-sonnet', claudeVersion: '2.1.330' })
  })

  it('tool_use blocks across assistant events are counted per tool name with sorted keys', () => {
    const parsed = parseStream([assistantLine('mcp__beechcms__beech_schema_plan', 'Bash'), assistantLine('Bash')])

    expect(parsed.toolCalls).toEqual({ Bash: 2, mcp__beechcms__beech_schema_plan: 1 })
    expect(Object.keys(parsed.toolCalls)).toEqual(['Bash', 'mcp__beechcms__beech_schema_plan'])
  })

  it('the last result event wins when the stream carries two', () => {
    const parsed = parseStream([resultLine({ num_turns: 1 }), resultLine({ num_turns: 7 })])

    expect(parsed.result?.numTurns).toBe(7)
  })

  it('malformed and blank lines are skipped without throwing', () => {
    const parsed = parseStream(['', '{not json', '42', resultLine()])

    expect(parsed.result?.numTurns).toBe(4)
  })
})

describe('classifyRun', () => {
  it('a connected beechcms server and a success result classify as completed with cache tokens folded into input', () => {
    const parsed = parseStream([initLine('connected'), assistantLine('Bash'), resultLine()])

    const metrics = classifyRun(parsed, exitFacts)

    expect(metrics).toMatchObject({
      status: 'completed', turns: 4, inputTokens: 600, outputTokens: 50, cacheReadTokens: 300,
      costUsd: 0.05, durationMs: 9_000, toolCalls: { Bash: 1 }, finalText: 'done', error: null,
    })
  })

  it('a missing or failed beechcms server classifies as harness_error even when a result exists', () => {
    const failed = classifyRun(parseStream([initLine('failed'), resultLine()]), exitFacts)
    const missing = classifyRun(parseStream([resultLine()]), exitFacts)

    expect(failed).toMatchObject({ status: 'harness_error', error: 'MCP server beechcms not connected: failed' })
    expect(missing).toMatchObject({ status: 'harness_error', error: 'MCP server beechcms not connected: missing' })
  })

  it('a timeout classifies as timeout with null token metrics when no result arrived', () => {
    const metrics = classifyRun(parseStream([initLine('connected')]), { ...exitFacts, timedOut: true, exitCode: null })

    expect(metrics).toMatchObject({ status: 'timeout', turns: null, inputTokens: null, outputTokens: null, durationMs: 12_000 })
  })

  it('an is_error result classifies as agent_error carrying the subtype', () => {
    const parsed = parseStream([initLine('connected'), resultLine({ subtype: 'error_max_turns', is_error: true })])

    const metrics = classifyRun(parsed, exitFacts)

    expect(metrics).toMatchObject({ status: 'agent_error', error: 'error_max_turns' })
  })

  it('a stream with init but no result classifies as harness_error carrying the exit code', () => {
    const parsed: ParsedStream = parseStream([initLine('connected')])

    const metrics = classifyRun(parsed, { ...exitFacts, exitCode: 1, stderrTail: 'boom' })

    expect(metrics).toMatchObject({ status: 'harness_error', error: 'no result event; exit 1: boom' })
  })
})

describe('extractAnswer', () => {
  it('the last ANSWER line is parsed as JSON', () => {
    const answer = extractAnswer('ANSWER: {"Ada": 1}\nmore text\n  ANSWER: {"Ada": 4, "Grace": 3}  ')

    expect(answer).toEqual({ Ada: 4, Grace: 3 })
  })

  it('text without an ANSWER line returns undefined', () => {
    expect(extractAnswer('just prose')).toBeUndefined()
    expect(extractAnswer(null)).toBeUndefined()
  })

  it('an ANSWER line with invalid JSON returns undefined', () => {
    const answer = extractAnswer('ANSWER: {nope')

    expect(answer).toBeUndefined()
  })
})
