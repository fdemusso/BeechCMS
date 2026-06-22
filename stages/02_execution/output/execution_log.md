# Sprint 7 — Background Queues & Job Handlers (`IQueueService`) — Execution Log

## Section 6 — Acceptance Criteria

- [x] `packages/core/src/queue.interface.ts` exists and imports **only** other `@beech/core` types (zero runtime/third-party deps — parity with `scheduler.interface.ts`).
- [x] `JobContext` exposes `repository: ContentRepository` and `bucket: BeechBucket`; it does **not** expose `env.DB` or any `D1Database`. (Botanical Invariant.)
- [x] `IQueueService.enqueue` and all impls **never throw** on transport failure (errors are logged, swallowed).
- [x] New core symbols are re-exported from `packages/core/src/index.ts`.
- [x] `Env.QUEUE?: Queue` and `Variables.queue: IQueueService` added to `apps/api/src/types.ts`; `AppEnv` unchanged in shape.
- [x] `queueMiddleware` registered in `createBeechApp` **after** `storageMiddleware` and **before** `authProvidersMiddleware`; uses the conditional `binding → CloudflareQueueService` / `else → InMemoryQueueService` pattern.
- [x] `BeechConfig.jobs?: JobRegistry` added; the published default app (`index.ts`) registers an empty registry.
- [x] `index.ts` exports `queue(batch, env, ctx)` alongside `fetch`/`scheduled`; missing `env.DB` acks the batch without throwing.
- [x] `dispatchQueueBatch` acks on success, acks+logs on unknown job name, `retry()`s on handler throw.
- [x] `wrangler.jsonc` declares matching `producers` (`QUEUE` → `beech-jobs`) and `consumers` (`beech-jobs`); `wrangler deploy --dry-run` confirms `env.QUEUE (beech-jobs) Queue` binding is resolved.
- [x] No `apps/api/src/features/*` slice imports another (VSA); shared code lives in `shared/` + `middleware/`.
- [x] `flow-background-queues.test.ts` covers: (a) `c.get('queue').enqueue` from a custom route runs the handler via the in-memory fallback, (b) `dispatchQueueBatch` ack/retry/unknown-name paths.
- [x] `pnpm build`, `pnpm type-check`, `pnpm test`, `pnpm lint` all green.

## Validation Output

```
pnpm --filter @beechcms/core build   → exit 0 (tsc clean)
pnpm --filter @beechcms/api type-check → exit 0 (tsc clean)
pnpm type-check  → Tasks: 7 successful, 7 total
pnpm build       → Tasks: 7 successful, 7 total
pnpm test        → 8 successful — @beechcms/api: 6/6 new tests passed; 630 dashboard tests passed
pnpm lint        → no issues in new files (pre-existing @typescript-eslint/no-explicit-any elsewhere)
wrangler deploy --dry-run → env.QUEUE (beech-jobs) Queue binding confirmed
```
