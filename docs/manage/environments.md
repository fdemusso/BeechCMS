---
title: Environment Configuration & AppEnv
description: Comprehensive guide to Cloudflare Worker bindings, environment variables, secrets, and the AppEnv contract in BeechCMS.
---

# Environment Configuration & AppEnv

BeechCMS is built to run natively on Cloudflare Workers, leveraging serverless primitives like **Cloudflare D1**, **Cloudflare R2**, and **Workers AI**.

Configuration in BeechCMS is governed by the **`AppEnv`** contract, which cleanly separates runtime Cloudflare infrastructure bindings (`Env`) from per-request dependency injection services (`Variables`).

---

## The AppEnv Contract

Every Hono router and API handler in BeechCMS is typed with `AppEnv`:

```typescript
import type { Context } from 'hono'
import type { AppEnv } from '../types'

export async function customHandler(c: Context<AppEnv>) {
  // Access Cloudflare Bindings & Env vars:
  const db = c.env.DB
  const jwtSecret = c.env.JWT_SECRET

  // Access Middleware-injected services:
  const logger = c.get('activityLogger')
  const scheduler = c.get('scheduler')
  const privacy = c.get('privacyService')
}
```

`AppEnv` combines two distinct layers:

1. **`c.env` (Bindings & Secrets)**: Infrastructure components provided directly by Cloudflare Workers runtime (D1 databases, R2 buckets, environment secrets).
2. **`c.get(...)` (Request Variables)**: Domain repositories, cryptography services, schedulers, and authenticated user contexts initialized per-request by middleware.

---

## Cloudflare Infrastructure Bindings

Declared in `wrangler.toml` and bound at runtime:

| Binding | Type | Description |
| :--- | :--- | :--- |
| `DB` | `D1Database` | Primary SQLite database for content schemas, seeds, and metadata. |
| `MEDIA_BUCKET` | `R2Bucket` | Object storage bucket for image and file uploads. |
| `SEARCH_R2` | `R2Bucket` | Storage bucket for compiled vector binaries (`vectors.bin`) and search manifests. |
| `AI` | `WorkersAI` | Cloudflare Workers AI binding for embedding generation. |
| `LOGIN_RATE_LIMITER` | `RateLimit` | Cloudflare edge rate limiter for the admin login route. |
| `REFRESH_RATE_LIMITER`| `RateLimit` | Edge rate limiter for token refresh rotation. |
| `PUBLIC_READ_RATE_LIMITER`| `RateLimit`| Rate limiting for public read queries. |
| `PUBLIC_WRITE_RATE_LIMITER`| `RateLimit`| Rate limiting for public form submissions. |

---

## Environment Variables & Secrets

### Core Authentication & Security

| Variable | Required | Description |
| :--- | :---: | :--- |
| `JWT_SECRET` | Yes | 256-bit secret key used to sign and verify HMAC-SHA256 JWT tokens. |
| `JWT_ISSUER` | Optional | Value validated against the `iss` claim (default: `beechcms`). |
| `JWT_AUDIENCE` | Optional | Value validated against the `aud` claim (default: `beechcms-api`). |
| `CORS_ORIGINS` | Optional | Comma-separated list of allowed origins (e.g. `https://my-site.com,https://admin.my-site.com`). |

### Public API & Forms

| Variable | Required | Description |
| :--- | :---: | :--- |
| `PUBLIC_READ_API_KEY` | Recommended | Key required to query public content via `/api/v1/public/*`. |
| `PUBLIC_WRITE_API_KEY` | Recommended | Key required for public submissions and form entries. |
| `PUBLIC_PUBLISHED_ONLY`| Optional | When set to `true`, restricts public reads strictly to published items. |

### Automations & Delivery

| Variable | Required | Description |
| :--- | :---: | :--- |
| `RESEND_API_KEY` | Optional | API key for transactional emails via [Resend](https://resend.com/). |
| `EMAIL_FROM` | Optional | Default sender address (e.g. `BeechCMS <noreply@yourdomain.com>`). |
| `WEBHOOK_SECRET` | Optional | Secret key used to sign outgoing automation webhooks with HMAC-SHA256 (`X-BeechCMS-Signature`). |
| `QSTASH_URL` | Optional | Upstash QStash REST publish URL for serverless queues. |
| `QSTASH_TOKEN` | Optional | Bearer token for Upstash QStash. |
| `QSTASH_CURRENT_SIGNING_KEY` | Optional | Primary signing key for inbound QStash webhook verification. |
| `QSTASH_NEXT_SIGNING_KEY` | Optional | Secondary key for seamless key rotation in QStash. |

---

## Local Development Configuration

During local development, Wrangler loads environment secrets from a `.dev.vars` file in the project root:

```ini
# .dev.vars (Never commit to version control)
JWT_SECRET=super-secret-local-jwt-token-key-change-me
RESEND_API_KEY=re_dev_123456789
EMAIL_FROM="BeechCMS Dev <noreply@localhost>"
PUBLIC_READ_API_KEY=pk_live_read_12345
PUBLIC_WRITE_API_KEY=pk_live_write_12345
WEBHOOK_SECRET=whsec_dev_local_secret
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
```

To run local development with D1 and R2 emulated:

```bash
pnpm run dev
```

---

## Production Secrets Management

In production on Cloudflare Workers, sensitive keys must never be stored in plain text or in `wrangler.toml`. Use the Wrangler CLI to securely upload secrets directly to Cloudflare's encrypted key vault:

```bash
# Set JWT signing secret
npx wrangler secret put JWT_SECRET --env production

# Set Resend email key
npx wrangler secret put RESEND_API_KEY --env production

# Set Webhook HMAC secret
npx wrangler secret put WEBHOOK_SECRET --env production

# Set QStash tokens
npx wrangler secret put QSTASH_TOKEN --env production
npx wrangler secret put QSTASH_CURRENT_SIGNING_KEY --env production
```

Wrangler prompts you interactively to enter each secret, ensuring they remain encrypted at rest.

---

## Injected Request Services (`Variables`)

The BeechCMS middleware pipeline instantiates and registers singleton services on each request via Hono's `c.set()`:

```typescript
// Available on any c.get(...) in handlers:
const scheduler = c.get('scheduler')              // IScheduler (waitUntil async task executor)
const activityLogger = c.get('activityLogger')    // IActivityLogger (audit logging)
const notificationService = c.get('notificationService') // INotificationService
const privacyService = c.get('privacyService')    // IPrivacyService (ALE encryption/blind indexing)
const jwtPayload = c.get('jwtPayload')            // Authenticated user claims (id, email, role)
```

This dependency-injection architecture ensures handlers remain strictly testable with mock providers and fixed clocks.
