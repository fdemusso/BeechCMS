# Background Queues & Job Handlers

This document covers the deferred-execution port delivered by Sprint 7.

## Why this exists

Edge workers have a hard per-request CPU budget. Any `customRoutes` handler
that needs heavy or long-running work (bulk export, fan-out email, CRM sync)
could not previously offload it. This sprint adds `IQueueService` so that
work can be *enqueued* from a request and *consumed* outside the request
lifecycle via a Cloudflare Queue binding.

## Architecture

| Layer | File | Role |
|---|---|---|
| Contract | `packages/core/src/queue.interface.ts` | `IQueueService`, `QueueMessage`, `JobContext`, `JobHandler`, `JobRegistry` |
| Stub | `packages/core/src/queue.stub.ts` | `NoOpQueueService` — safe no-op for tests that don't assert on enqueue |
| Production impl | `apps/api/src/shared/cloudflare-queue-service.ts` | Wraps `env.QUEUE.send`; swallows transport errors |
| Dev/test fallback | `apps/api/src/shared/in-memory-queue-service.ts` | Runs handler inline when `QUEUE` binding is absent |
| Consumer | `apps/api/src/shared/queue-consumer.ts` | `dispatchQueueBatch` — routes messages to handlers, acks/retries per-message |
| Middleware | `apps/api/src/middleware/queue.middleware.ts` | Injects `c.get('queue')` into every request |

The middleware selects the implementation at runtime:
- `env.QUEUE` present → `CloudflareQueueService` (production)
- `env.QUEUE` absent → `InMemoryQueueService` (local dev, tests, `wrangler dev`)

## Botanical Invariant

`JobContext` never exposes `env.DB` or any raw `D1Database`. Jobs receive:

```ts
interface JobContext {
  repository: ContentRepository  // only sanctioned D1 path
  bucket: BeechBucket
  clock: IClock
  idGenerator: IIdGenerator
  env: Record<string, string | undefined>  // secrets/URLs only, no DB
}
```

## Registering jobs in `BeechConfig`

```ts
import { createBeechApp } from '@beechcms/api'
import type { JobHandler } from '@beechcms/core'

const sendWelcome: JobHandler<{ userId: string }> = async (payload, ctx) => {
  const user = await ctx.repository.findEntry('users', payload.userId)
  // ... send email via ctx.env.RESEND_API_KEY
}

const app = createBeechApp({
  seeds: [...],
  jobs: {
    'send-welcome': sendWelcome,
  },
})
```

## Enqueueing from a custom route

```ts
customRoutes: ({ protectedRouter }) => {
  protectedRouter.post('/users/:id/welcome', async (c) => {
    await c.get('queue').enqueue('send-welcome', { userId: c.req.param('id') })
    return c.json({ ok: true })
  })
}
```

`enqueue` never throws — if the transport fails, the error is logged and the
request continues. This matches the `INotificationService` fire-and-forget
contract.

## Consumer (`queue()` export)

`apps/api/src/index.ts` exports a `queue()` handler alongside `fetch` and
`scheduled`. Cloudflare automatically routes incoming queue messages to it.

The consumer:
- Acks the message on handler success.
- Acks + logs on unknown job name (drop, no retry).
- Calls `message.retry()` when the handler throws (Cloudflare re-delivers up
  to `max_retries` times).

## Wrangler config

`apps/api/wrangler.jsonc` declares both sides of the queue:

```jsonc
"queues": {
  "producers": [
    { "binding": "QUEUE", "queue": "beech-jobs" }
  ],
  "consumers": [
    {
      "queue": "beech-jobs",
      "max_batch_size": 10,
      "max_batch_timeout": 5,
      "max_retries": 3
    }
  ]
}
```

Before first deploy, create the queue:

```bash
npx wrangler queues create beech-jobs
```

`wrangler dev` simulates the queue locally via Miniflare. If the `QUEUE`
binding is absent (e.g. running without Miniflare), `InMemoryQueueService`
is selected automatically — no configuration needed.

## Out of scope (v1)

- QStash queue implementation (QStash remains a notification-only concern).
- D1 job-status persistence (Cloudflare Queues owns durability + retries).
- Concrete example job handlers.
- Priority queues, delays, dead-letter-queue UI, retry-policy DSL.
- Dashboard monitoring for queue state.
