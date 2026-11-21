// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAdminApi } from './admin-api.ts'
import { killLiveAgent, runAgent } from './agent-run.ts'
import { parseEvalArgs } from './args.ts'
import { GRANTS_BY_VARIANT, mintGrants } from './grants.ts'
import { parseStream } from './metrics.ts'
import { buildReport, renderMarkdown } from './report.ts'
import { killLiveStack, preflight, provisionWorld, startFreshStack, type EvalStack } from './stack.ts'
import { EVAL_SUITE } from './tasks.ts'
import type { EvalVariant, RunMetrics, TaskResult } from './types.ts'
import { createWorkspace, type AgentWorkspace } from './workspace.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function stampOf(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
}

function harnessFailure(error: unknown): RunMetrics {
  return {
    status: 'harness_error', turns: null, inputTokens: null, outputTokens: null, cacheReadTokens: null, costUsd: null,
    durationMs: 0, toolCalls: {}, finalText: null, error: error instanceof Error ? error.message : String(error),
  }
}

function progressLine(variant: EvalVariant, taskId: string, result: TaskResult): string {
  const { metrics, verdict } = result
  const label = metrics.status === 'completed' ? (verdict?.success ? 'pass' : 'fail') : metrics.status
  const tokens = metrics.inputTokens === null ? '' : `, ${metrics.inputTokens.toLocaleString('en-US').replace(/,/g, ' ')} in / ${(metrics.outputTokens ?? 0).toLocaleString('en-US').replace(/,/g, ' ')} out`
  return `[${variant}] ${taskId}: ${label} (${metrics.turns ?? '–'} turns${tokens})${metrics.error ? ` ${metrics.error}` : ''}`
}

async function main(): Promise<number> {
  let args
  try {
    args = parseEvalArgs(process.argv.slice(2), EVAL_SUITE.map(task => task.id))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }
  try {
    await preflight(repoRoot)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  const startedAt = new Date()
  const stamp = stampOf(startedAt)
  const runDir = join(repoRoot, 'evals/.runs', stamp)
  mkdirSync(runDir, { recursive: true })
  process.env.BEECH_EVAL_RUN_DIR = runDir
  const gitCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()

  const results: TaskResult[] = []
  let claudeVersion = 'unknown'
  let liveStack: EvalStack | null = null
  const cleanup = (): void => {
    killLiveAgent()
    killLiveStack()
  }
  process.on('exit', cleanup)
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(130))

  for (const task of EVAL_SUITE.filter(candidate => args.taskIds.includes(candidate.id))) {
    for (const variant of args.variants) {
      const transcriptFile = join(runDir, variant, `${task.id}.jsonl`)
      let workspace: AgentWorkspace | null = null
      let metrics: RunMetrics
      let verdict: TaskResult['verdict'] = null
      try {
        liveStack = await startFreshStack(repoRoot)
        const world = await provisionWorld(liveStack.apiUrl)
        workspace = createWorkspace(repoRoot, variant, task.id)
        await mintGrants(world, liveStack.apiUrl, workspace.tokenCacheFile, GRANTS_BY_VARIANT[variant])
        const prepared = await task.prepare(world.api)
        metrics = await runAgent({ variant, workspace, prompt: prepared.prompt, model: args.model, timeoutMs: args.timeoutMs, budgetUsd: args.budgetUsd, transcriptFile })
        if (claudeVersion === 'unknown') {
          claudeVersion = parseStream(readFileSync(transcriptFile, 'utf8').split('\n')).init?.claudeVersion ?? claudeVersion
        }
        if (metrics.status !== 'harness_error') verdict = await prepared.verify(createAdminApi(world.api.baseUrl, world.adminToken), metrics.finalText)
      } catch (error) {
        metrics = harnessFailure(error)
      } finally {
        await liveStack?.stop()
        liveStack = null
        if (workspace && !args.keepWorkspaces) workspace.remove()
      }
      const result: TaskResult = { taskId: task.id, variant, metrics, verdict, transcript: relative(repoRoot, transcriptFile) }
      results.push(result)
      console.error(progressLine(variant, task.id, result))
    }
  }

  const report = buildReport({ startedAt: startedAt.toISOString(), gitCommit, model: args.model, claudeVersion, tasks: EVAL_SUITE, results })
  const reportDir = join(repoRoot, 'evals/reports', stamp)
  mkdirSync(reportDir, { recursive: true })
  const jsonPath = join(reportDir, 'report.json')
  const markdownPath = join(reportDir, 'report.md')
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(markdownPath, renderMarkdown(report))
  console.log(jsonPath)
  console.log(markdownPath)
  return results.some(result => result.metrics.status === 'harness_error') ? 1 : 0
}

process.exitCode = await main()
