// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import { describe, it, expect } from 'vitest'
import { RUN_LOG_LIMIT, runScript, type RunScriptInput } from '../lib/script-runner.js'
import { RUN_ERROR_CODES, RUN_REPORT_VERSION } from '../sdk/run-report.js'
import type { BeechScript } from '../sdk/define-script.js'
import type { SdkClock, SdkRequest, SdkTransport } from '../sdk/types.js'

const JSON_HEADERS = { 'Content-Type': 'application/json' }
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })

const gateBody = {
  intent: {
    id: 'a3f1c2d4-0b5e-4c1a-9e1f-2b7d6a8c9e10',
    operationId: 'content.delete',
    risk: 'destructive',
    summary: 'Permanently delete posts entry e1',
    status: 'pending',
    expiresAt: 1_900_000_600,
  },
}

describe('runScript', () => {
  function recordingTransport(...answers: Response[]) {
    const requests: SdkRequest[] = []
    const queue = [...answers]
    const transport: SdkTransport = {
      async send(request) {
        requests.push(request)
        return queue.shift() ?? jsonResponse({})
      },
    }
    return { requests, transport }
  }

  function queuedClock(...times: number[]): SdkClock {
    const queue = [...times]
    return { now: () => queue.shift() ?? 0, sleep: async () => {} }
  }

  function inputFor(script: unknown, overrides: Partial<RunScriptInput> = {}): { input: RunScriptInput; requests: SdkRequest[] } {
    const { requests, transport } = recordingTransport()
    const input: RunScriptInput = {
      scriptPath: '/project/.beech/scripts/demo.ts',
      displayPath: '.beech/scripts/demo.ts',
      args: {},
      dryRun: false,
      transport,
      apiUrl: 'http://localhost:8789',
      clock: queuedClock(),
      importScript: async () => ({ default: script }),
      ...overrides,
    }
    return { input, requests }
  }

  it('a script that reads and writes yields status ok, its result, and calls in call order', async () => {
    const { requests, transport } = recordingTransport(jsonResponse({ id: 'e1' }), jsonResponse({ id: 'e2' }, 201))
    const script: BeechScript = async beech => {
      const entry = await beech.content.get('posts', 'e1')
      const created = await beech.content.create('posts', { title: 'Hello' })
      return { entry, created }
    }
    const { input } = inputFor(script, { transport })

    const report = await runScript(input)

    expect(report.status).toBe('ok')
    expect(report.error).toBeNull()
    expect(report.result).toEqual({ entry: { id: 'e1' }, created: { kind: 'executed', status: 201, data: { id: 'e2' } } })
    expect(report.calls.map(call => [call.operationId, call.outcome])).toEqual([
      ['content.get', 'executed'],
      ['content.create', 'executed'],
    ])
    expect(requests).toHaveLength(2)
  })

  it('the report keys follow the RunReport order and version is RUN_REPORT_VERSION', async () => {
    const { input } = inputFor(() => 'done')

    const report = await runScript(input)

    expect(Object.keys(report)).toEqual(['version', 'script', 'status', 'dryRun', 'apiUrl', 'durationMs', 'result', 'error', 'logs', 'calls', 'pendingIntents'])
    expect(report.version).toBe(RUN_REPORT_VERSION)
    expect(report).toMatchObject({ script: '.beech/scripts/demo.ts', apiUrl: 'http://localhost:8789' })
  })

  it('an undefined return value is reported as null', async () => {
    const { input } = inputFor(() => undefined)

    const report = await runScript(input)

    expect(report.status).toBe('ok')
    expect(report.result).toBeNull()
  })

  it('args and dryRun reach the script context unchanged', async () => {
    const { input } = inputFor((_beech: unknown, context: { args: unknown; dryRun: boolean }) => ({ args: context.args, dryRun: context.dryRun }), {
      args: { seed: 'posts', limit: '5' },
      dryRun: true,
    })

    const report = await runScript(input)

    expect(report.result).toEqual({ args: { seed: 'posts', limit: '5' }, dryRun: true })
    expect(report.dryRun).toBe(true)
  })

  it('under dryRun a write is journaled as dry-run and the transport receives only reads', async () => {
    const script: BeechScript = async beech => {
      await beech.content.get('posts', 'e1')
      return beech.content.create('posts', { title: 'Hello' })
    }
    const { input, requests } = inputFor(script, { dryRun: true })

    const report = await runScript(input)

    expect(report.status).toBe('ok')
    expect(report.calls.map(call => call.outcome)).toEqual(['executed', 'dry-run'])
    expect(requests.map(request => request.method)).toEqual(['GET'])
  })

  it('console.log inside the script lands in logs and console is restored after a throw', async () => {
    const originalLog = console.log
    const script = () => {
      console.log('hello', { a: 1 })
      throw new Error('after log')
    }
    const { input } = inputFor(script)

    const report = await runScript(input)

    expect(report.logs).toEqual(['hello {"a":1}'])
    expect(report.error?.code).toBe(RUN_ERROR_CODES.SCRIPT_ERROR)
    expect(console.log).toBe(originalLog)
  })

  it('log lines beyond RUN_LOG_LIMIT are replaced by one dropped-count marker', async () => {
    const script: BeechScript = (_beech, context) => {
      for (let line = 0; line < RUN_LOG_LIMIT + 3; line++) context.log(`line ${line}`)
    }
    const { input } = inputFor(script)

    const report = await runScript(input)

    expect(report.logs).toHaveLength(RUN_LOG_LIMIT + 1)
    expect(report.logs.at(-1)).toBe('… 3 more log lines dropped')
  })

  it('a 202 gate answer puts the intent in pendingIntents and the status stays ok', async () => {
    const { transport } = recordingTransport(jsonResponse(gateBody, 202))
    const { input } = inputFor((beech: { content: { delete(slug: string, id: string): Promise<unknown> } }) => beech.content.delete('posts', 'e1'), { transport })

    const report = await runScript(input)

    expect(report.status).toBe('ok')
    expect(report.pendingIntents).toEqual([gateBody.intent])
    expect(report.calls.map(call => call.outcome)).toEqual(['pending'])
  })

  it('a BeechSdkError from the script becomes error with its code, status and operationId, keeping prior calls', async () => {
    const { transport } = recordingTransport(jsonResponse({ id: 'e1' }), jsonResponse({ type: 'not_found', detail: 'gone' }, 404))
    const script: BeechScript = async beech => {
      await beech.content.get('posts', 'e1')
      await beech.content.get('posts', 'missing')
    }
    const { input } = inputFor(script, { transport })

    const report = await runScript(input)

    expect(report.status).toBe('error')
    expect(report.result).toBeNull()
    expect(report.error).toEqual({ code: 'not_found', message: 'content.get failed (404): gone', status: 404, operationId: 'content.get' })
    expect(report.calls.map(call => call.outcome)).toEqual(['executed', 'error'])
  })

  it('a plain thrown Error becomes error code script_error', async () => {
    const { input } = inputFor(() => {
      throw new Error('pass --arg seed=<slug>')
    })

    const report = await runScript(input)

    expect(report.status).toBe('error')
    expect(report.error).toEqual({ code: 'script_error', message: 'pass --arg seed=<slug>', status: null, operationId: null })
  })

  it('a default export that is not a function gives invalid_script and sends nothing', async () => {
    const { input, requests } = inputFor(42)

    const report = await runScript(input)

    expect(report.error?.code).toBe(RUN_ERROR_CODES.INVALID_SCRIPT)
    expect(report.calls).toEqual([])
    expect(requests).toHaveLength(0)
  })

  it('an import failure naming @beechcms/cli gives sdk_unresolved; any other gives script_load_failed', async () => {
    const cases = [
      { failure: Object.assign(new Error("Cannot find package '@beechcms/cli' imported from /p/s.ts"), { code: 'ERR_MODULE_NOT_FOUND' }), code: 'sdk_unresolved' },
      { failure: Object.assign(new Error("Cannot find package 'lodash' imported from /p/s.ts"), { code: 'ERR_MODULE_NOT_FOUND' }), code: 'script_load_failed' },
      { failure: new SyntaxError('Unexpected token'), code: 'script_load_failed' },
    ]

    for (const { failure, code } of cases) {
      const { input } = inputFor(null, { importScript: async () => { throw failure } })

      const report = await runScript(input)

      expect(report.status).toBe('error')
      expect(report.error?.code).toBe(code)
      expect(report.calls).toEqual([])
    }
  })

  it('a BigInt result gives result_not_serializable with result null', async () => {
    const { input } = inputFor(() => 10n)

    const report = await runScript(input)

    expect(report.status).toBe('error')
    expect(report.result).toBeNull()
    expect(report.error?.code).toBe(RUN_ERROR_CODES.RESULT_NOT_SERIALIZABLE)
  })

  it('durationMs is the clock difference between start and end', async () => {
    const { input } = inputFor(() => 'done', { clock: queuedClock(1_000, 1_250) })

    const report = await runScript(input)

    expect(report.durationMs).toBe(250)
  })
})
