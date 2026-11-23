// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/**
 * @module sdk/run-report
 * Machine-readable summary printed by `beech run`. Field order is the serialized key order.
 */

import type { AgentIntentPending } from '@beechcms/core'
import type { SdkCallRecord } from './types.js'

/** Bumped only on a breaking change to {@link RunReport}. */
export const RUN_REPORT_VERSION = 1

export interface RunError {
  /** SDK/API code for a BeechSdkError (may be null when the API sent none), else one of RUN_ERROR_CODES. */
  code: string | null
  message: string
  /** HTTP status for a BeechSdkError, else null. */
  status: number | null
  /** Catalog id for a BeechSdkError, else null. */
  operationId: string | null
}

export interface RunReport {
  version: typeof RUN_REPORT_VERSION
  /** Script path relative to the working directory, POSIX separators. */
  script: string
  status: 'ok' | 'error'
  dryRun: boolean
  apiUrl: string
  durationMs: number
  /** The script's JSON-normalized return value; `undefined` becomes null; null when status is 'error'. */
  result: unknown
  error: RunError | null
  logs: string[]
  calls: SdkCallRecord[]
  pendingIntents: AgentIntentPending[]
}

export const RUN_ERROR_CODES = {
  SCRIPT_LOAD_FAILED: 'script_load_failed',
  SDK_UNRESOLVED: 'sdk_unresolved',
  INVALID_SCRIPT: 'invalid_script',
  SCRIPT_ERROR: 'script_error',
  RESULT_NOT_SERIALIZABLE: 'result_not_serializable',
} as const
