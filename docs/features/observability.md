---
title: Observability & Notifications
description: Asynchronous real-time notifications and immutable audit logging at the edge.
---

# Observability & Notifications

BeechCMS includes built-in systems for **real-time admin notifications** and **zero-overhead activity logging**. Both subsystems execute asynchronously at the Cloudflare edge, ensuring that database writes, user logins, and automations never introduce latency to HTTP responses.

## Architecture Pipeline

All audit logs and notifications are dispatched via the `IScheduler` abstraction (`c.get('scheduler').waitUntil(...)`). This offloads database inserts and webhook triggers to Cloudflare Workers background execution while returning immediate responses to clients.

<p align="center">
  <img src="/images/notifications-observability-pipeline.svg" alt="BeechCMS Observability & Notifications Pipeline" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

## Upstash QStash Queue

BeechCMS integrates with [Upstash QStash](https://upstash.com/docs/qstash/overall/getstarted) as its primary background message queue and webhook delivery engine for serverless edge environments.

### Why QStash at the Edge

Edge runtimes like Cloudflare Workers are stateless and cannot maintain long-lived TCP connections or run persistent background broker listeners (like RabbitMQ or Celery). 

QStash solves this by acting as an **HTTP-native serverless message queue**:
- **Zero Connection Overhead**: Messages are published via standard HTTPS REST calls.
- **At-Least-Once Delivery**: Guarantees message persistence until the receiving webhook or worker acknowledges it.
- **Automated Retries & Backoff**: Failed webhook endpoints or temporary downtime trigger exponential backoff without tying up Worker CPU time.
- **Cryptographic Signatures**: Inbound callbacks are verified using HMAC SHA-256 signing keys to prevent spoofing.

### Environment Configuration

To enable QStash delivery for notifications and external webhooks, configure these environment variables in your Cloudflare Worker:

```ini
QSTASH_URL="https://qstash.upstash.io/v2/publish"
QSTASH_TOKEN="ey..."
QSTASH_CURRENT_SIGNING_KEY="sig_..."
QSTASH_NEXT_SIGNING_KEY="sig_..."
```

When these variables are detected, `observabilityMiddleware` automatically instantiates `QStashNotificationService` instead of local memory queuing.

## Activity Logging

The activity logging subsystem tracks changes made across the CMS, creating an immutable audit trail for compliance and dashboard activity feeds.

### Tracked Events

| Event Type | Trigger | Recorded Details |
| :--- | :--- | :--- |
| `create` | Content entry created | Seed slug, entry ID, author, initial fields |
| `update` | Content entry modified | Seed slug, entry ID, updated fields, author |
| `delete` | Content entry removed | Seed slug, deleted entry ID, author |
| `publish` | Draft promoted to live | Seed slug, entry ID, version metadata |
| `login` | User session initiated | User ID, IP address, user agent |

### Programmatic Logging

Within any API route or custom handler, record audit events using `c.get('activityLogger')`:

```typescript
import type { Context } from 'hono'
import type { Env, Variables } from '../types'

export async function customActionHandler(c: Context<{ Bindings: Env; Variables: Variables }>) {
  const jwt = c.get('jwtPayload')
  const entryId = c.req.param('id')

  // Perform domain operation
  // ...

  // Asynchronously record the activity log
  c.get('scheduler').waitUntil(
    c.get('activityLogger').log({
      action: 'update',
      entityType: 'content',
      entityId: entryId,
      entitySlug: 'articles',
      actor: {
        id: jwt.sub,
        email: jwt.email ?? 'system',
        name: jwt.name ?? null,
      },
      details: {
        reason: 'Bulk tag update',
      },
    })
  )

  return c.json({ ok: true })
}
```

### Dashboard History

Administrators can inspect activity logs in two places:
1. **Dashboard Cockpit**: The *Recent Activity* widget displays the latest content modifications with relative timestamps.
2. **Settings → Activity**: A searchable, paginated history of all administrative actions, filtered by user, date range, or Seed.

## In-App Notifications

BeechCMS provides an in-app notification inbox accessible via the bell icon in the dashboard navigation header.

### Severity Levels

| Severity | UI Indicator | Recommended Use Case |
| :--- | :--- | :--- |
| `info` | Blue badge | General updates, scheduled jobs completed |
| `success` | Emerald badge | Form submissions, successful content publishes |
| `warning` | Amber badge | Impending quota limits, unverified draft changes |
| `error` | Rose badge | Webhook delivery failure, payment gateway alert |

### Dispatching Alerts

You can trigger notifications from custom endpoints, scheduled cron jobs, or background tasks:

```typescript
const notificationService = c.get('notificationService')

c.get('scheduler').waitUntil(
  notificationService.notify({
    title: 'New Contact Form Submission',
    message: 'A new lead submitted the contact form on your website.',
    type: 'success',
    link: '/content/leads',
  })
)
```

## Testing & Clocks

To ensure tests run fast without monkey-patching `Date.now()` or `crypto.randomUUID()`, both `D1ActivityLogger` and `D1NotificationRepository` accept injected `IClock` and `IIdGenerator` instances.

In test suites (`vitest`), pass `FixedClock` and `SequentialIdGenerator`:

```typescript
import { FixedClock } from '../shared/fixed-clock'
import { SequentialIdGenerator } from '../shared/sequential-id-generator'
import { D1ActivityLogger } from '../shared/d1-activity-logger'

const clock = new FixedClock(1700000000000)
const idGen = new SequentialIdGenerator('test-log')
const logger = new D1ActivityLogger(d1Database, clock, idGen)

await logger.log({
  action: 'create',
  entityType: 'content',
  entityId: 'entry-123',
  entitySlug: 'posts',
  actor: { id: 'usr_1', email: 'editor@example.com', name: 'Editor' },
})
```
