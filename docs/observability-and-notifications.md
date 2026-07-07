---
title: Observability & Notifications
group: Developer Guide (Internals)
category: Internals
---

# Observability & Notifications module

This document covers the abstractions delivered by Phase 2 of the abstraction
plan (`docs/Sprints/02-abstraction.md`). It replaces the two free functions
`logActivity(c, ...)` and `createNotification(c, ...)` with interface-driven
modules that mirror the email module pattern.

## Why this exists

Before Phase 2 the audit trail and the notification inbox were written
through free functions that received the entire Hono `Context`, read
`c.env.DB` and `c.executionCtx` directly, and ran inline `INSERT` statements.
That coupling made handlers untestable in isolation and forced any new sink
(remote logger, message queue, mock for tests) to crawl through the Hono
runtime.

Phase 2 introduces three contracts in `@beechcms/core` and three
implementations in `apps/api`:

| Contract                 | Location (core)                                          | Production impl (api)                                                   | Test impl                                          |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------- |
| `IActivityLogger`        | `observability/activity-logger.ts`                       | `D1ActivityLogger` (`shared/d1-activity-logger.ts`)                     | `InMemoryActivityLogger`                           |
| `IActivityLogRepository` | `observability/activity-log.repository.ts`               | `D1ActivityLogRepository` (`shared/d1-activity-log.repository.ts`)      | mock via `vi.fn`                                   |
| `INotificationRepository`| `notifications/notification.repository.ts`               | `D1NotificationRepository` (`shared/d1-notification.repository.ts`)     | mock via `vi.fn`                                   |
| `INotificationService`   | `notifications/notification-service.ts`                  | `BackgroundNotificationService` (`shared/background-notification-service.ts`) | `InMemoryNotificationService`                |

## Wiring

Two middlewares cooperate:

1. `repositoryMiddleware` (already existed) — instantiates
   `D1ActivityLogRepository` and `D1NotificationRepository` and injects them
   as `c.get('activityLogRepository')` / `c.get('notificationRepository')`.
2. `observabilityMiddleware` (new, `apps/api/src/middleware/observability.middleware.ts`) —
   instantiates `D1ActivityLogger` and `BackgroundNotificationService` and
   injects them as `c.get('activityLogger')` / `c.get('notificationService')`.
   The notification service depends on the repository, so this middleware
   MUST run after the repository middleware. Both wrap
   `c.executionCtx.waitUntil` so the persistence work runs as a Cloudflare
   background task and never blocks the HTTP response.

Registration order in `factory.ts`:

```
repositoryMiddleware → storageMiddleware → authProvidersMiddleware
  → rateLimiterMiddleware → observabilityMiddleware
```

### Phase 4 update — `IClock` and `IIdGenerator`

`D1ActivityLogger` and `D1NotificationRepository` no longer call `crypto.randomUUID()` or `Date.now()` directly. Both accept the new cross-cutting utilities as constructor arguments:

```ts
new D1ActivityLogger(db, clock, idGenerator, scheduleBackgroundTask?)
new D1NotificationRepository(db, clock, idGenerator)
```

In production, `repositoryMiddleware` and `observabilityMiddleware` resolve them to `SystemClock` / `SystemIdGenerator` (from `@beechcms/core`). Tests pass `FixedClock` / `SequentialIdGenerator` from `apps/api/src/shared/` for deterministic IDs and timestamps without `vi.useFakeTimers()` or global `Date` patching.

Both middlewares accept matching overrides:

```ts
observabilityMiddleware({ clock?, idGenerator?, activityLogger?, notificationService? })
repositoryMiddleware({ clock?, idGenerator?, … })
```

## Calling the activity logger from a handler

```ts
const jwtPayload = context.get('jwtPayload')
context.get('activityLogger').log({
  action: 'create',
  entityType: 'content',
  entityId: id,
  entitySlug: slug,
  details: { title },
  actor: {
    id: jwtPayload.sub,
    email: jwtPayload.email ?? 'unknown',
    name: jwtPayload.name ?? null,
  },
})
```

Rules:

- The handler — never the logger — assembles the `actor` object from the JWT
  payload. The logger has no Hono knowledge.
- `log()` returns `void | Promise<void>` and is fire-and-forget in
  production. Errors are swallowed and reported via `console.error`; they
  never propagate to the user-facing response.

## Calling the notification service

```ts
context.get('notificationService').notify({
  title: `${seed.label}: New entry`,
  message: `A new entry has been added via the public API.`,
  type: 'success',
})
```

Same fire-and-forget contract as the logger. The default `type` is `info`.

## Reading activity logs

The settings activity tab (`GET /api/settings/activity`) and the recent
activity widget (`GET /api/content/stats/recent-activity`) both go through
`IActivityLogRepository`:

```ts
const entries = await context.get('activityLogRepository').list({
  userId,                 // optional
  entitySlug,             // optional
  limit: 30,
})
```

A `countSince({ action, entityType, sinceTimestamp })` method on the same
repository powers the `/stats/total` widget (today/week/month create-event
counts). It runs a single parameterised `SELECT COUNT(*)` and is invoked
three times in parallel from the handler — keeping the SQL inside the
repository while preserving the existing wire contract.

The repository builds the optional `WHERE` clauses using guard clauses, so
the SQL is deterministic and parameterised (no string interpolation). Snake
case columns are mapped to camelCase fields on the way out; `details` is
parsed back from JSON or returned as `null` when absent or malformed.

## Notification ETag

`GET /notifications` builds a strong ETag from the repository's `stats()`
aggregate so a client polling the inbox returns `304 Not Modified` whenever
nothing has changed since the previous request. The format is
`W/"<totalCount>-<latestCreatedAt>-<readCount>"` and is unchanged from the
pre-Phase-2 implementation — the move from inline SQL to the repository
preserves the wire contract exactly.

## Tests

The unit tests live alongside the implementations in `apps/api/src/shared/`:

- `d1-activity-logger.test.ts` — INSERT shape, actor fallback, background
  scheduling, error swallowing.
- `d1-activity-log.repository.test.ts` — column mapping, JSON parsing,
  optional WHERE clauses, ORDER BY / LIMIT.
- `d1-notification.repository.test.ts` — list / stats / create / mark*/delete.
- `background-notification-service.test.ts` — repository delegation,
  default type, scheduler delegation, error swallowing.

Run them with `pnpm test` from `apps/api/`.

## Migration notes

The two old free functions and their imports have been deleted:

- `apps/api/src/shared/activity-logger.ts` — gone
- `apps/api/src/shared/notification-service.ts` — gone

Callers updated:

- `features/content/handlers/{create,update,delete}.ts`
- `features/draft/draft.handler.ts` (saveDraft + publishDraft)
- `upload.ts`
- `public/public-add.ts` and `public/public-edit.ts`
- `features/notifications/notifications.handler.ts` — full rewrite, no SQL
- `features/settings/settings.handler.ts` — activity tab now uses repo
- `features/stats/stats.handler.ts` — recent-activity now uses repo

The `jwtPayload` shape in `apps/api/src/types.ts` was widened to expose
`name?: string | null`, matching what the JWT actually carries, so handlers
can assemble the `actor` object without casting.
