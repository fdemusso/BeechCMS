// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { spawn, type ChildProcess } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { classifyRun, parseStream } from './metrics.ts'
import type { AgentWorkspace } from './workspace.ts'
import { EVAL_API_URL } from './stack.ts'
import type { EvalVariant, RunMetrics } from './types.ts'

export interface AgentRunInput {
  variant: EvalVariant
  workspace: AgentWorkspace
  prompt: string
  model: string
  timeoutMs: number
  budgetUsd: number
  transcriptFile: string   // absolute; evals/.runs/<stamp>/<variant>/<taskId>.jsonl
}

const V2_BUILTIN_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill']
const KILL_GRACE_MS = 5_000

/** Argument vector of `claude -p` for one run. Pure. */
export function claudeArgs(input: AgentRunInput): string[] {
  const common = [
    '-p', input.prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', input.model,
    '--mcp-config', input.workspace.mcpConfigFile,
    '--strict-mcp-config',
    '--setting-sources', 'project,local',
    '--append-system-prompt-file', input.workspace.systemPromptFile,
    '--no-session-persistence',
    '--max-budget-usd', String(input.budgetUsd),
  ]
  if (input.variant === 'v1') return [...common, '--tools', '', '--allowedTools', 'mcp__beechcms']
  return [...common, '--tools', V2_BUILTIN_TOOLS.join(','), '--allowedTools', ['mcp__beechcms', 'Bash(pnpm beech run:*)', ...V2_BUILTIN_TOOLS.filter(tool => tool !== 'Bash')].join(',')]
}

let liveChild: ChildProcess | null = null

/** Terminates the in-flight `claude` process, if any. Used by the CLI's signal handlers. */
export function killLiveAgent(): void {
  liveChild?.kill('SIGKILL')
}

/** Runs one headless agent session, tees stream-json to the transcript and classifies the outcome. */
export function runAgent(input: AgentRunInput): Promise<RunMetrics> {
  mkdirSync(dirname(input.transcriptFile), { recursive: true })
  writeFileSync(input.transcriptFile, '')
  const startedAt = Date.now()

  return new Promise<RunMetrics>(resolvePromise => {
    const child = spawn('claude', claudeArgs(input), {
      cwd: input.workspace.dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BEECH_API_URL: EVAL_API_URL, BEECH_TOKEN_CACHE: input.workspace.tokenCacheFile, MCP_TIMEOUT: '60000' },
    })
    liveChild = child
    let timedOut = false
    let stderr = ''
    let pending = ''
    let finished = false

    child.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8')
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim() !== '') appendFileSync(input.transcriptFile, `${line}\n`)
    })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref()
    }, input.timeoutMs)

    const finish = (exitCode: number | null, spawnError: string | null): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      liveChild = null
      if (pending.trim() !== '') appendFileSync(input.transcriptFile, `${pending}\n`)
      const lines = readFileSync(input.transcriptFile, 'utf8').split('\n')
      const metrics = classifyRun(parseStream(lines), {
        timedOut,
        exitCode,
        stderrTail: spawnError ?? stderr.slice(-500),
        wallMs: Date.now() - startedAt,
      })
      resolvePromise(metrics)
    }

    child.on('error', error => finish(null, error.message))
    child.on('close', code => finish(code, null))
  })
}
