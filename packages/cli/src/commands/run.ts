// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import pc from 'picocolors'
import { CliError, exitWithError } from '../lib/d1-context.js'
import { runScript } from '../lib/script-runner.js'
import { createApiClientTransport } from '../sdk/api-client-transport.js'
import type { RunReport } from '../sdk/run-report.js'

export const SCRIPTS_DIR = '.beech/scripts'
/** Max characters of `result` JSON printed in human mode. */
export const RUN_CONSOLE_RESULT_LIMIT = 4000

const ARG_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/
const RUN_USAGE = 'Usage: beech run <name|path> [--arg k=v ...] [--dry-run] [--json] [--out <file>] [--api-url <url>]'
const LISTED_SCRIPTS_LIMIT = 20
const RENDERED_LOG_LINES = 20

export interface RunOptions {
  script: string
  args: Record<string, string>
  dryRun: boolean
  json: boolean
  out?: string
  apiUrl?: string
}

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (value === undefined) throw new CliError(`${flag} requires a value.`, RUN_USAGE)
  return value
}

function parseArgPair(pair: string): [string, string] {
  const separatorIndex = pair.indexOf('=')
  const key = separatorIndex === -1 ? '' : pair.slice(0, separatorIndex)
  if (!ARG_KEY_PATTERN.test(key)) {
    throw new CliError(`Invalid --arg "${pair}": expected key=value with key matching ${ARG_KEY_PATTERN}.`, RUN_USAGE)
  }
  return [key, pair.slice(separatorIndex + 1)]
}

/** Pure. Throws CliError on usage errors. */
export function parseRunArgs(argv: readonly string[]): RunOptions {
  const positionals: string[] = []
  const args: Record<string, string> = {}
  const options: Omit<RunOptions, 'script'> = { args, dryRun: false, json: false }

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]
    if (token === '--arg') {
      const [key, value] = parseArgPair(takeValue(argv, index++, token))
      args[key] = value
    } else if (token === '--dry-run') {
      options.dryRun = true
    } else if (token === '--json') {
      options.json = true
    } else if (token === '--out') {
      options.out = takeValue(argv, index++, token)
    } else if (token === '--api-url') {
      options.apiUrl = takeValue(argv, index++, token)
    } else if (token.startsWith('-')) {
      throw new CliError(`Unknown flag: ${token}`, RUN_USAGE)
    } else {
      positionals.push(token)
    }
  }

  if (positionals.length !== 1) throw new CliError(RUN_USAGE)
  return { script: positionals[0], ...options }
}

function toPosix(path: string): string {
  return path.split(sep).join('/')
}

/** Pure given `exists`. Returns the absolute path; throws CliError when missing. */
export function resolveScriptPath(script: string, cwd: string, exists: (path: string) => boolean): string {
  const isPath = script.includes('/') || script.includes('\\') || script.endsWith('.ts')
  const path = isPath ? resolve(cwd, script) : resolve(cwd, SCRIPTS_DIR, `${script}.ts`)
  if (!path.endsWith('.ts')) throw new CliError(`Only .ts scripts can run: ${script}`)
  if (!exists(path)) {
    const shown = toPosix(isAbsolute(script) ? script : relative(cwd, path))
    throw new CliError(`Script not found: ${shown}`, missingScriptHint(cwd))
  }
  return path
}

function missingScriptHint(cwd: string): string {
  const directory = resolve(cwd, SCRIPTS_DIR)
  if (!existsSync(directory)) return `Run \`beech agent setup\` to create ${SCRIPTS_DIR}/`
  const names = readdirSync(directory)
    .filter(file => file.endsWith('.ts'))
    .map(file => file.slice(0, -'.ts'.length))
    .slice(0, LISTED_SCRIPTS_LIMIT)
  return names.length === 0 ? `No scripts in ${SCRIPTS_DIR}/` : `Available scripts: ${names.join(', ')}`
}

/** Pure. Human-mode rendering of a report. */
export function renderRunReport(report: RunReport): string {
  const lines: string[] = []
  const dryRunTag = report.dryRun ? pc.yellow('  DRY RUN') : ''
  lines.push('', `  ${pc.cyan(report.script)}  ${pc.gray(report.apiUrl)}${dryRunTag}`)

  const counts = ['executed', 'pending', 'dry-run', 'error']
    .map(outcome => `${outcome} ${report.calls.filter(call => call.outcome === outcome).length}`)
    .join('  ')
  lines.push(`  calls: ${counts}`)

  if (report.status === 'ok') {
    const resultJson = JSON.stringify(report.result, null, 2)
    const shown =
      resultJson.length > RUN_CONSOLE_RESULT_LIMIT
        ? `${resultJson.slice(0, RUN_CONSOLE_RESULT_LIMIT)}\n… truncated (${resultJson.length} chars), use --json or --out`
        : resultJson
    lines.push('', pc.green('  ✓ ok'), ...shown.split('\n').map(line => `  ${line}`))
  }

  if (report.logs.length > 0) {
    lines.push('', pc.gray('  logs'), ...report.logs.slice(-RENDERED_LOG_LINES).map(line => `    ${line}`))
  }

  if (report.pendingIntents.length > 0) {
    lines.push('', pc.yellow('  pending intents'))
    for (const intent of report.pendingIntents) lines.push(`    ${intent.id}  ${intent.risk}  ${intent.summary}`)
    lines.push(pc.gray('  Waiting for human approval: Dashboard → Agent actions'))
  }

  if (report.error !== null) {
    const { code, message, operationId } = report.error
    lines.push('', pc.red(`  ✗ ${code ?? 'error'}: ${message}`))
    if (operationId !== null) lines.push(pc.gray(`    operation: ${operationId}`))
  }

  lines.push('')
  return lines.join('\n')
}

/** `beech run <name|path> [--arg k=v ...] [--dry-run] [--json] [--out <file>] [--api-url <url>]` */
export async function run(argv: readonly string[]): Promise<void> {
  try {
    if (!process.features.typescript) {
      throw new CliError(`Node ${process.version} cannot run TypeScript scripts`, 'Use Node ≥ 22.18 (native type stripping)')
    }

    const options = parseRunArgs(argv)
    const cwd = process.cwd()
    const scriptPath = resolveScriptPath(options.script, cwd, existsSync)
    const transport = createApiClientTransport({ apiUrl: options.apiUrl })

    const report = await runScript({
      scriptPath,
      displayPath: toPosix(relative(cwd, scriptPath)),
      args: options.args,
      dryRun: options.dryRun,
      transport,
      apiUrl: transport.baseUrl,
    })

    const reportJson = JSON.stringify(report, null, 2) + '\n'
    if (options.out !== undefined) {
      const outPath = resolve(cwd, options.out)
      mkdirSync(dirname(outPath), { recursive: true })
      writeFileSync(outPath, reportJson)
    }
    process.stdout.write(options.json ? reportJson : renderRunReport(report))

    if (report.status === 'error') process.exitCode = 1
  } catch (error) {
    exitWithError(error)
  }
}
