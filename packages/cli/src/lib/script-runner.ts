// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module lib/script-runner
 * Loads and runs one `beech run` script against the SDK and turns the outcome into a {@link RunReport}.
 */

import { pathToFileURL } from 'node:url'
import { createBeechSdk } from '../sdk/create-sdk.js'
import { BeechSdkError } from '../sdk/errors.js'
import { RUN_ERROR_CODES, RUN_REPORT_VERSION, type RunError, type RunReport } from '../sdk/run-report.js'
import type { BeechScript, ScriptContext } from '../sdk/define-script.js'
import type { SdkClock, SdkTransport } from '../sdk/types.js'

/** Max entries kept in `RunReport.logs`; the excess is replaced by one marker line. */
export const RUN_LOG_LIMIT = 500

const SDK_UNRESOLVED_MESSAGE = '@beechcms/cli is not a dependency of this project. Run `beech agent setup`, then install.'
const INVALID_SCRIPT_MESSAGE = 'default export must be a function, use defineScript'

export interface RunScriptInput {
  /** Absolute path of the `.ts` file. */
  scriptPath: string
  /** Value for `RunReport.script`. */
  displayPath: string
  args: Readonly<Record<string, string>>
  dryRun: boolean
  transport: SdkTransport
  apiUrl: string
  /** Default: `Date.now` + `setTimeout` (same default as invoke.ts:L35-38). */
  clock?: SdkClock
  /** Default: `import(pathToFileURL(scriptPath).href)`. Injected by tests. */
  importScript?: (scriptPath: string) => Promise<unknown>
}

const defaultClock: SdkClock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

const defaultImportScript = (scriptPath: string): Promise<unknown> => import(pathToFileURL(scriptPath).href)

function formatLogPart(part: unknown): string {
  if (typeof part === 'string') return part
  try {
    return JSON.stringify(part) ?? String(part)
  } catch {
    return String(part)
  }
}

function toRunError(thrown: unknown): RunError {
  if (thrown instanceof BeechSdkError) {
    return { code: thrown.code, message: thrown.message, status: thrown.status, operationId: thrown.operationId || null }
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  return { code: RUN_ERROR_CODES.SCRIPT_ERROR, message, status: null, operationId: null }
}

function toLoadError(thrown: unknown): RunError {
  const message = thrown instanceof Error ? thrown.message : String(thrown)
  const code = (thrown as { code?: unknown } | null)?.code
  if (code === 'ERR_MODULE_NOT_FOUND' && message.includes('@beechcms/cli')) {
    return { code: RUN_ERROR_CODES.SDK_UNRESOLVED, message: SDK_UNRESOLVED_MESSAGE, status: null, operationId: null }
  }
  return { code: RUN_ERROR_CODES.SCRIPT_LOAD_FAILED, message, status: null, operationId: null }
}

/** Throws when `value` has no JSON form (BigInt, cycle); a top-level `undefined` becomes null. */
function normalizeResult(value: unknown): unknown {
  const text = JSON.stringify(value ?? null)
  return text === undefined ? null : JSON.parse(text)
}

/** Loads and runs one script. Never rejects: every failure becomes `status: 'error'`. */
export async function runScript(input: RunScriptInput): Promise<RunReport> {
  const clock = input.clock ?? defaultClock
  const importScript = input.importScript ?? defaultImportScript
  const start = clock.now()
  const { sdk, journal } = createBeechSdk({ transport: input.transport, dryRun: input.dryRun, clock })

  const logs: string[] = []
  let droppedLogs = 0
  const log = (...parts: unknown[]): void => {
    if (logs.length >= RUN_LOG_LIMIT) {
      droppedLogs++
      return
    }
    logs.push(parts.map(formatLogPart).join(' '))
  }

  let result: unknown = null
  let error: RunError | null = null

  const loaded = await importScript(input.scriptPath).then(
    module => ({ module }),
    (thrown: unknown) => ({ failure: thrown }),
  )

  if ('failure' in loaded) {
    error = toLoadError(loaded.failure)
  } else {
    const script = (loaded.module as { default?: unknown } | null)?.default
    if (typeof script !== 'function') {
      error = { code: RUN_ERROR_CODES.INVALID_SCRIPT, message: INVALID_SCRIPT_MESSAGE, status: null, operationId: null }
    } else {
      const context: ScriptContext = { args: Object.freeze({ ...input.args }), log, dryRun: input.dryRun }
      const originalLog = console.log
      const originalInfo = console.info
      console.log = log
      console.info = log
      try {
        const value = await (script as BeechScript)(sdk, context)
        try {
          result = normalizeResult(value)
        } catch (thrown) {
          const message = thrown instanceof Error ? thrown.message : String(thrown)
          error = { code: RUN_ERROR_CODES.RESULT_NOT_SERIALIZABLE, message, status: null, operationId: null }
        }
      } catch (thrown) {
        error = toRunError(thrown)
      } finally {
        console.log = originalLog
        console.info = originalInfo
      }
    }
  }

  if (droppedLogs > 0) logs.push(`… ${droppedLogs} more log lines dropped`)

  return {
    version: RUN_REPORT_VERSION,
    script: input.displayPath,
    status: error === null ? 'ok' : 'error',
    dryRun: input.dryRun,
    apiUrl: input.apiUrl,
    durationMs: clock.now() - start,
    result: error === null ? result : null,
    error,
    logs,
    calls: [...journal.calls],
    pendingIntents: [...journal.pendingIntents],
  }
}
