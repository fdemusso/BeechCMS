// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBeechApp } from '../src/factory'
import { dispatchQueueBatch } from '../src/shared/jobs/queue-consumer'
import { NoOpQueueService } from '@beechcms/core'
import type { JobHandler, JobRegistry, QueueMessage } from '@beechcms/core'
import { StaticContentRepository } from './mocks/static-content.repository'
import { StaticIdempotencyRepository } from './mocks/static-idempotency.repository'
import { D1TestDatabase } from './helpers/d1-test-database'
import { seedTestUsers } from './helpers/seed-fixtures'
import { TEST_SEEDS, TEST_USERS, TEST_ENV } from './fixtures'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(body: QueueMessage, overrides: Partial<{ ack: () => void; retry: () => void }> = {}) {
  return {
    id: 'msg-1',
    timestamp: new Date(),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  }
}

function makeBatch(messages: ReturnType<typeof makeMessage>[]): MessageBatch<QueueMessage> {
  return { queue: 'beech-jobs', messages } as unknown as MessageBatch<QueueMessage>
}

function makeExecutionContext(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext
}

// ---------------------------------------------------------------------------
// Suite A: enqueue from a custom route (in-memory fallback)
// ---------------------------------------------------------------------------

describe('Flow: Background Queues — enqueue from custom route', () => {
  let db: D1TestDatabase
  let authToken: string

  beforeEach(async () => {
    db = new D1TestDatabase()
    await seedTestUsers(db, TEST_USERS)
  })

  it('runs the registered job handler when enqueue is called from a protected custom route', async () => {
    const executed = vi.fn<[unknown], Promise<void>>().mockResolvedValue(undefined)

    const jobs: JobRegistry = {
      'send-welcome': executed as JobHandler,
    }

    const app = createBeechApp({
      seeds: TEST_SEEDS,
      repository: new StaticContentRepository(TEST_SEEDS),
      idempotencyRepository: new StaticIdempotencyRepository(),
      jobs,
      customRoutes: ({ protectedRouter }) => {
        protectedRouter.post('/trigger-welcome', async (c) => {
          await c.get('queue').enqueue('send-welcome', { userId: 'u_42' })
          return c.json({ ok: true })
        })
      },
    })

    // Login
    const loginRes = await app.request('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TEST_USERS[0].email, password: 'password123' }),
    }, { ...TEST_ENV, DB: db })
    authToken = (await loginRes.json<{ token: string }>()).token

    // Trigger custom route
    const res = await app.request('/api/custom/trigger-welcome', {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    }, { ...TEST_ENV, DB: db })

    expect(res.status).toBe(200)
    // InMemoryQueueService awaits inline (no executionCtx in test env)
    expect(executed).toHaveBeenCalledOnce()
    expect(executed.mock.calls[0][0]).toEqual({ userId: 'u_42' })
  })

  it('NoOpQueueService does not throw, ignores enqueue, and reports success', async () => {
    const noop = new NoOpQueueService()
    await expect(noop.enqueue('anything', { x: 1 })).resolves.toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Suite B: dispatchQueueBatch — ack / retry / unknown-name
// ---------------------------------------------------------------------------

describe('Flow: Background Queues — dispatchQueueBatch', () => {
  const baseEnv = { ...TEST_ENV, DB: undefined as any }
  const ctx = makeExecutionContext()

  it('acks message and calls handler on success', async () => {
    const handler = vi.fn<[unknown, unknown], Promise<void>>().mockResolvedValue(undefined)
    const jobs: JobRegistry = { 'my-job': handler as JobHandler }
    const msg = makeMessage({ name: 'my-job', payload: { data: 1 } })

    await dispatchQueueBatch(makeBatch([msg]), baseEnv as any, ctx, jobs)

    expect(handler).toHaveBeenCalledOnce()
    expect(msg.ack).toHaveBeenCalledOnce()
    expect(msg.retry).not.toHaveBeenCalled()
  })

  it('acks and logs (does not retry) when job name is unknown', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const msg = makeMessage({ name: 'unknown-job', payload: {} })

    await dispatchQueueBatch(makeBatch([msg]), baseEnv as any, ctx, {})

    expect(msg.ack).toHaveBeenCalledOnce()
    expect(msg.retry).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('unknown-job'))
    consoleSpy.mockRestore()
  })

  it('acks and logs (does not retry) for prototype-polluting job names like "constructor" or "toString"', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const msgConstructor = makeMessage({ name: 'constructor', payload: {} })
    const msgToString = makeMessage({ name: 'toString', payload: {} })

    await dispatchQueueBatch(makeBatch([msgConstructor]), baseEnv as any, ctx, {})
    await dispatchQueueBatch(makeBatch([msgToString]), baseEnv as any, ctx, {})

    expect(msgConstructor.ack).toHaveBeenCalledOnce()
    expect(msgConstructor.retry).not.toHaveBeenCalled()
    expect(msgToString.ack).toHaveBeenCalledOnce()
    expect(msgToString.retry).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('constructor'))
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('toString'))
    consoleSpy.mockRestore()
  })

  it('retries message when handler throws', async () => {
    const handler = vi.fn<[unknown, unknown], Promise<void>>().mockRejectedValue(new Error('boom'))
    const jobs: JobRegistry = { 'failing-job': handler as JobHandler }
    const msg = makeMessage({ name: 'failing-job', payload: {} })

    await dispatchQueueBatch(makeBatch([msg]), baseEnv as any, ctx, jobs)

    expect(msg.ack).not.toHaveBeenCalled()
    expect(msg.retry).toHaveBeenCalledOnce()
  })

  it('processes multiple messages independently (ack/retry per message)', async () => {
    const goodHandler = vi.fn<[unknown, unknown], Promise<void>>().mockResolvedValue(undefined)
    const badHandler = vi.fn<[unknown, unknown], Promise<void>>().mockRejectedValue(new Error('fail'))
    const jobs: JobRegistry = { good: goodHandler as JobHandler, bad: badHandler as JobHandler }

    const msgGood = makeMessage({ name: 'good', payload: 'a' })
    const msgBad = makeMessage({ name: 'bad', payload: 'b' })

    await dispatchQueueBatch(makeBatch([msgGood, msgBad]), baseEnv as any, ctx, jobs)

    expect(msgGood.ack).toHaveBeenCalledOnce()
    expect(msgGood.retry).not.toHaveBeenCalled()
    expect(msgBad.retry).toHaveBeenCalledOnce()
    expect(msgBad.ack).not.toHaveBeenCalled()
  })

  it('drops malformed messages without crashing the batch', async () => {
    const handler = vi.fn<[unknown, unknown], Promise<void>>().mockResolvedValue(undefined)
    const jobs: JobRegistry = { good: handler as JobHandler }
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Malformed body: null
    const msgNull = makeMessage(null as any)
    // Malformed body: undefined
    const msgUndefined = makeMessage(undefined as any)
    // Malformed body: primitive
    const msgString = makeMessage("not-an-object" as any)
    // Malformed body: valid object but name is not a string
    const msgNumberName = makeMessage({ name: 123, payload: {} } as any)
    // Good message
    const msgGood = makeMessage({ name: 'good', payload: 'ok' })

    const batch = makeBatch([msgNull, msgUndefined, msgString, msgNumberName, msgGood])
    
    await dispatchQueueBatch(batch, baseEnv as any, ctx, jobs)
    
    expect(msgNull.ack).toHaveBeenCalledOnce()
    expect(msgUndefined.ack).toHaveBeenCalledOnce()
    expect(msgString.ack).toHaveBeenCalledOnce()
    expect(msgNumberName.ack).toHaveBeenCalledOnce()
    
    // Good message processed successfully
    expect(handler).toHaveBeenCalledOnce()
    expect(msgGood.ack).toHaveBeenCalledOnce()
    
    consoleSpy.mockRestore()
  })
})
