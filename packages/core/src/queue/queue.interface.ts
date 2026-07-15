// SPDX-License-Identifier: MIT
// Copyright (c) 2024–2026 Flavio De Musso

import type { ContentRepository } from '../content/content.repository.js'
import type { BeechBucket } from '../common/storage.js'
import type { IClock } from '../common/clock.js'
import type { IIdGenerator } from '../common/id-generator.js'

/**
 * The envelope put on the wire / queue. `name` selects the handler from the
 * JobRegistry; `payload` is the developer-supplied, JSON-serializable body.
 */
export interface QueueMessage<T = unknown> {
  name: string
  payload: T
}

/**
 * Execution context handed to every job. Botanical Invariant: jobs receive the
 * engine-mediated repository, NEVER a raw D1Database. `env` is a read-only,
 * stringly-typed view of bindings/secrets for things like fetch targets — it
 * deliberately does not expose `DB`.
 */
export interface JobContext {
  repository: ContentRepository
  bucket: BeechBucket
  clock: IClock
  idGenerator: IIdGenerator
  env: Record<string, string | undefined>
}

/** A single background worker. Receives the decoded payload + context. */
export type JobHandler<T = unknown> = (
  payload: T,
  context: JobContext,
) => Promise<void>

/** Name -> handler map, supplied via BeechConfig.jobs. */
export type JobRegistry = Record<string, JobHandler<any>>

/**
 * Producer port. `enqueue` schedules deferred work and returns once the message
 * is accepted by the transport. Like INotificationService, implementations MUST
 * decide their own fire-and-forget vs inline semantics and MUST NOT let a
 * transport failure crash the request that called enqueue. Resolves `true`
 * when the message was handed off successfully, `false` when it was dropped
 * (e.g. transport rejection, oversized payload, no handler) — callers that
 * need at-least-once delivery guarantees MUST check this instead of assuming
 * a resolved promise means success.
 */
export interface IQueueService {
  enqueue<T>(name: string, payload: T): Promise<boolean>
}
