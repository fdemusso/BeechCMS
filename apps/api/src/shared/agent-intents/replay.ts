// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/// <reference types="@cloudflare/workers-types" />
import type { ExecutionContext } from 'hono'
import { sha256hex, type OAuthScope } from '@beechcms/core'
import type { Env } from '../../types'

/** Module-private key: a value stored under it in the request env cannot be set or read from HTTP. */
const REPLAY_KEY = Symbol('beechcms.intentReplay')

type ReplayCarrier = Env & { [REPLAY_KEY]?: IntentReplay }

/** What an in-process replay of an approved intent carries; set only by the approve handler. */
export interface IntentReplay {
  intentId: string
  userId: string
  clientId: string
  /** Exactly `[operation.scope]` of the stored operation. */
  scope: OAuthScope[]
  payloadHash: string
}

/** Runs a request through the whole app in-process (`app.fetch`). Provided by the factory. */
export type IntentDispatcher = (request: Request, env: Env, executionCtx?: ExecutionContext) => Promise<Response>

/**
 * A shallow copy of `env` carrying the replay; `env` itself is never mutated.
 *
 * @param env - The env of the approve request.
 * @param replay - Identity and payload binding of the intent being replayed.
 */
export function withIntentReplay(env: Env, replay: IntentReplay): Env {
  const carrier: ReplayCarrier = { ...env, [REPLAY_KEY]: replay }
  return carrier
}

/**
 * The replay carried by this request env, or `null` for every request that came over HTTP.
 *
 * @param env - The env of the current request.
 */
export function readIntentReplay(env: Env): IntentReplay | null {
  // `env` is undefined when a test app is called without bindings.
  const carrier: ReplayCarrier | undefined = env
  return carrier?.[REPLAY_KEY] ?? null
}

/**
 * Hex SHA-256 of `${method}\n${pathWithQuery}\n${body ?? ''}` (method upper-cased).
 * Same input → same hash; binds an intent to exactly what was asked.
 *
 * @param method - HTTP method, any case.
 * @param pathWithQuery - Pathname plus query string as received.
 * @param body - Raw body text, or `null` when absent.
 */
export function intentPayloadHash(method: string, pathWithQuery: string, body: string | null): Promise<string> {
  return sha256hex(`${method.toUpperCase()}\n${pathWithQuery}\n${body ?? ''}`)
}
