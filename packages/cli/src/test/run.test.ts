// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { RUN_CONSOLE_RESULT_LIMIT, parseRunArgs, renderRunReport, resolveScriptPath } from '../commands/run.js'
import { CliError } from '../lib/d1-context.js'
import { RUN_REPORT_VERSION, type RunReport } from '../sdk/run-report.js'

function reportWith(overrides: Partial<RunReport> = {}): RunReport {
  return {
    version: RUN_REPORT_VERSION,
    script: '.beech/scripts/demo.ts',
    status: 'ok',
    dryRun: false,
    apiUrl: 'http://localhost:8789',
    durationMs: 12,
    result: null,
    error: null,
    logs: [],
    calls: [],
    pendingIntents: [],
    ...overrides,
  }
}

// eslint-disable-next-line no-control-regex
const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, '')

describe('parseRunArgs', () => {
  it('parses one positional, repeated --arg pairs split on the first equals sign, and the boolean flags', () => {
    const argv = ['demo', '--arg', 'seed=posts', '--arg', 'filter=a=b', '--arg', 'seed=articles', '--dry-run', '--json', '--out', 'r.json', '--api-url', 'http://x']

    const options = parseRunArgs(argv)

    expect(options).toEqual({
      script: 'demo',
      args: { seed: 'articles', filter: 'a=b' },
      dryRun: true,
      json: true,
      out: 'r.json',
      apiUrl: 'http://x',
    })
  })

  it('rejects a missing script, two positionals, an --arg without equals, and an unknown flag with CliError', () => {
    const invalidArgvs = [[], ['a', 'b'], ['a', '--arg', 'novalue'], ['a', '--arg', '=x'], ['a', '--arg', '1bad=x'], ['a', '--out'], ['a', '--nope']]

    for (const argv of invalidArgvs) {
      expect(() => parseRunArgs(argv), JSON.stringify(argv)).toThrow(CliError)
    }
  })
})

describe('resolveScriptPath', () => {
  const cwd = '/project'

  it('a bare name resolves to .beech/scripts/<name>.ts under cwd', () => {
    const path = resolveScriptPath('demo', cwd, () => true)

    expect(path).toBe('/project/.beech/scripts/demo.ts')
  })

  it('a value with a slash or a .ts suffix resolves against cwd', () => {
    const withSlash = resolveScriptPath('tools/demo.ts', cwd, () => true)
    const withSuffix = resolveScriptPath('demo.ts', cwd, () => true)

    expect(withSlash).toBe('/project/tools/demo.ts')
    expect(withSuffix).toBe('/project/demo.ts')
  })

  it('a missing file throws CliError naming the relative path', () => {
    const resolveMissing = () => resolveScriptPath('ghost', cwd, () => false)

    expect(resolveMissing).toThrow(CliError)
    expect(resolveMissing).toThrow('Script not found: .beech/scripts/ghost.ts')
  })

  it('a non-.ts path throws CliError', () => {
    const resolveJs = () => resolveScriptPath('tools/demo.js', cwd, () => true)

    expect(resolveJs).toThrow(CliError)
  })
})

describe('renderRunReport', () => {
  it('a result longer than RUN_CONSOLE_RESULT_LIMIT is cut and marked truncated', () => {
    const report = reportWith({ result: { text: 'x'.repeat(RUN_CONSOLE_RESULT_LIMIT * 2) } })

    const output = stripAnsi(renderRunReport(report))

    expect(output).toContain('… truncated (')
    expect(output).toContain('use --json or --out')
    expect(output.length).toBeLessThan(RUN_CONSOLE_RESULT_LIMIT + 500)
  })

  it('pending intents are listed with id, risk and summary plus the dashboard approval hint', () => {
    const report = reportWith({
      pendingIntents: [
        {
          id: 'a3f1c2d4-0b5e-4c1a-9e1f-2b7d6a8c9e10',
          operationId: 'content.delete',
          risk: 'destructive',
          summary: 'Permanently delete posts entry e1',
          status: 'pending',
          expiresAt: 1_900_000_600,
        },
      ],
    })

    const output = stripAnsi(renderRunReport(report))

    expect(output).toContain('a3f1c2d4-0b5e-4c1a-9e1f-2b7d6a8c9e10  destructive  Permanently delete posts entry e1')
    expect(output).toContain('Waiting for human approval: Dashboard → Agent actions')
  })
})
