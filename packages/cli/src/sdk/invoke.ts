// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/invoke
 * One SDK call: builds the request from the operation catalog, applies dry-run, sends through the
 * transport and maps the answer to a read body, a {@link WriteOutcome}, or a {@link BeechSdkError}.
 */

import {
  OPERATION_CATALOG,
  isAgentIntentPendingResponse,
  resolveOperationRisk,
  type AgentIntentPending,
  type AgentOperationSpec,
  type OperationRisk,
} from '@beechcms/core'
import { BeechSdkError, SDK_ERROR_CODES } from './errors.js'
import { SDK_OMITTED_OPERATIONS } from './operations.js'
import type { BeechSdkOptions, SdkCallRecord, SdkClock, SdkJournal, SdkQuery, WriteOutcome } from './types.js'

/** Internal. One SDK call: builds the request from the catalog, applies dry-run, maps the answer. */
export interface SdkInvoker {
  call(operationId: string, pathParams: readonly string[], input: { query?: SdkQuery; body?: unknown }): Promise<unknown>
  readonly journal: SdkJournal
  readonly options: Required<Pick<BeechSdkOptions, 'dryRun'>> & { fetch: typeof fetch; clock: SdkClock }
}

const AGENT_OPERATIONS: ReadonlyMap<string, AgentOperationSpec> = new Map(
  OPERATION_CATALOG.flatMap(operation => (operation.exposure === 'agent' ? [[operation.id, operation] as const] : [])),
)

const PATH_PARAM_PATTERN = /:[A-Za-z_]+/g

const defaultClock: SdkClock = {
  now: () => Date.now(),
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
}

/** Narrows an outcome to the intent that replaced the request. */
export function isPending<T>(outcome: WriteOutcome<T>): outcome is Extract<WriteOutcome<T>, { kind: 'pending' }> {
  return outcome.kind === 'pending'
}

/** Narrows an outcome to a request that ran. */
export function isExecuted<T>(outcome: WriteOutcome<T>): outcome is Extract<WriteOutcome<T>, { kind: 'executed' }> {
  return outcome.kind === 'executed'
}

function buildPath(pattern: string, pathParams: readonly string[], operationId: string): string {
  const placeholders = pattern.match(PATH_PARAM_PATTERN) ?? []
  if (placeholders.length !== pathParams.length) {
    throw new Error(`${operationId} expects ${placeholders.length} path params, got ${pathParams.length}`)
  }
  let index = 0
  return pattern.replace(PATH_PARAM_PATTERN, () => encodeURIComponent(pathParams[index++]))
}

function toQueryStrings(query: SdkQuery | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue
    result[key] = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
  }
  return result
}

async function parseBody(response: Response, operationId: string): Promise<unknown> {
  const text = response.status === 204 ? '' : await response.text()
  if (text === '') return null
  if (!(response.headers.get('Content-Type') ?? '').includes('json')) return text
  try {
    return JSON.parse(text)
  } catch {
    throw new BeechSdkError(`${operationId} answered invalid JSON`, response.status, SDK_ERROR_CODES.INVALID_JSON, operationId, text)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function errorFromAnswer(operationId: string, status: number, statusText: string, parsed: unknown): BeechSdkError {
  const body = asRecord(parsed)
  const code =
    typeof body.type === 'string' ? body.type
    : typeof body.error === 'string' && /^[a-z0-9_-]+$/.test(body.error) ? body.error
    : null
  const detail = [body.detail, body.error_description, body.error].find((candidate): candidate is string => typeof candidate === 'string') ?? statusText
  return new BeechSdkError(`${operationId} failed (${status}): ${detail}`, status, code, operationId, parsed)
}

/** Builds the invoker behind every SDK method. */
export function createInvoker(options: BeechSdkOptions): SdkInvoker {
  const calls: SdkCallRecord[] = []
  const pendingIntents: AgentIntentPending[] = []
  const dryRun = options.dryRun ?? false

  async function call(operationId: string, pathParams: readonly string[], input: { query?: SdkQuery; body?: unknown }): Promise<unknown> {
    const operation = AGENT_OPERATIONS.get(operationId)
    if (operation === undefined || operationId in SDK_OMITTED_OPERATIONS) {
      throw new Error(`${operationId} is not an SDK-callable agent operation`)
    }

    const queryStrings = toQueryStrings(input.query)
    if (operationId === 'content.list' && queryStrings.page === undefined) {
      // Without a page param the API answers a bare array instead of the paged shape.
      queryStrings.page = '1'
    }
    const queryText = new URLSearchParams(queryStrings).toString()
    const path = buildPath(operation.path, pathParams, operationId) + (queryText === '' ? '' : `?${queryText}`)
    const risk: OperationRisk = resolveOperationRisk(operation, { query: queryStrings, body: input.body })
    const record = { operationId, method: operation.method, path, risk }

    if (dryRun && risk !== 'read') {
      const dryRunCall: SdkCallRecord = { ...record, outcome: 'dry-run', status: null, body: input.body }
      calls.push(dryRunCall)
      return { kind: 'dry-run', call: dryRunCall } satisfies WriteOutcome<never>
    }

    let response: Response
    try {
      response = await options.transport.send({ method: operation.method, path, body: input.body })
    } catch (error) {
      calls.push({ ...record, outcome: 'error', status: null })
      if (error instanceof BeechSdkError) {
        throw new BeechSdkError(error.message, error.status, error.code, operationId, error.body)
      }
      throw error
    }

    const parsed = await parseBody(response, operationId)
    if (response.status === 202 && isAgentIntentPendingResponse(parsed)) {
      pendingIntents.push(parsed.intent)
      calls.push({ ...record, outcome: 'pending', status: response.status })
      return { kind: 'pending', intent: parsed.intent } satisfies WriteOutcome<never>
    }
    if (response.ok) {
      calls.push({ ...record, outcome: 'executed', status: response.status })
      return operation.risk === 'read'
        ? parsed
        : ({ kind: 'executed', status: response.status, data: parsed } satisfies WriteOutcome<unknown>)
    }

    calls.push({ ...record, outcome: 'error', status: response.status })
    throw errorFromAnswer(operationId, response.status, response.statusText, parsed)
  }

  return {
    call,
    journal: { calls, pendingIntents },
    options: { dryRun, fetch: options.fetch ?? globalThis.fetch, clock: options.clock ?? defaultClock },
  }
}
