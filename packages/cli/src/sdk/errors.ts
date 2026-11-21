// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

/** Registered symbol: identical across every bundled copy of this module. */
export const BEECH_SDK_ERROR_BRAND: unique symbol = Symbol.for('beechcms.sdk.error')

/** Failure of an SDK call: an API error answer, an unreachable API, or a helper-level refusal. */
export class BeechSdkError extends Error {
  readonly name = 'BeechSdkError'

  constructor(
    message: string,
    /** HTTP status; `0` when the API was unreachable or the failure is not an HTTP answer. */
    readonly status: number,
    /** Machine-readable code: a problem `type`, an OAuth `error`, or one of {@link SDK_ERROR_CODES}. */
    readonly code: string | null,
    readonly operationId: string,
    readonly body: unknown,
  ) {
    super(message)
    Object.defineProperty(this, BEECH_SDK_ERROR_BRAND, { value: true, enumerable: false })
  }

  /** Brand check, so errors thrown by another bundled copy of this class still match. */
  static [Symbol.hasInstance](value: unknown): boolean {
    return typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[BEECH_SDK_ERROR_BRAND] === true
  }
}

export const SDK_ERROR_CODES = {
  UNREACHABLE: 'unreachable',
  UNAUTHORIZED: 'unauthorized',
  INVALID_JSON: 'invalid_json',
  LIST_CAP_EXCEEDED: 'list_cap_exceeded',
  STORAGE_PUT_FAILED: 'storage_put_failed',
  IMPORT_WAIT_TIMEOUT: 'import_wait_timeout',
} as const
