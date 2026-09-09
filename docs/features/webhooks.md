---
title: Webhooks & Event Delivery
description: Cryptographic event dispatching, HMAC-SHA256 signatures, Next.js/Astro ISR triggers, and SDK verification.
---

# Webhooks & Event Delivery

BeechCMS delivers real-time notifications to external systems whenever content events occur (`create`, `update`, `delete`). Whether triggering On-Demand Incremental Static Regeneration (ISR) in Next.js, cache invalidation in Astro, or notifying Slack, webhooks bridge BeechCMS with external services securely.

---

## Architectural Principles

- **Cryptographic Authenticity**: Outbound webhook requests carry an HMAC-SHA256 signature in the `X-BeechCMS-Signature` header, computed against the raw JSON payload.
- **Timing-Safe Verification**: Receivers can verify signatures without timing-attack vulnerabilities using the native `@beechcms/client/webhooks` submodule.
- **Asynchronous & Non-Blocking**: Webhook requests are dispatched via Cloudflare's `executionCtx.waitUntil` or queued via Upstash QStash, guaranteeing that slow receiver endpoints never degrade CMS editing latency.

<p align="center">
  <img src="/images/webhooks-delivery-pipeline.svg" alt="BeechCMS Cryptographic Webhook Delivery & ISR Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Outbound Payload Structure

```json
{
  "event": "content.updated",
  "seed": "articles",
  "id": "art_01HXYZ",
  "timestamp": "2026-09-05T22:30:00.000Z",
  "data": {
    "title": "Edge-Native CMS with Cloudflare D1",
    "slug": "edge-native-cms",
    "status": "published"
  },
  "actor": {
    "id": "usr_102",
    "email": "editor@company.com"
  }
}
```

Headers sent with every delivery:

```http
POST /api/revalidate HTTP/1.1
Host: your-frontend.com
Content-Type: application/json
X-BeechCMS-Signature: sha256=a5b9c8d7e6f5...
User-Agent: BeechCMS-Webhook/1.0
```

---

## Verifying Signatures with the Client SDK

BeechCMS provides an official zero-dependency isomorphic verification helper via `@beechcms/client/webhooks`:

### Next.js Route Handler Example (`app/api/revalidate/route.ts`)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { constructWebhookEvent, WebhookVerificationError } from '@beechcms/client/webhooks'
import { revalidateTag } from 'next/cache'

export async function POST(req: NextRequest) {
  const payload = await req.text()
  const signature = req.headers.get('x-beechcms-signature')
  const secret = process.env.BEECH_WEBHOOK_SECRET!

  try {
    const event = constructWebhookEvent<{ seed: string; id: string }>({
      payload,
      signature,
      secret,
    })

    // Revalidate on-demand ISR cache
    revalidateTag(event.seed)
    return NextResponse.json({ revalidated: true, now: Date.now() })
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Bad Request' }, { status: 400 })
  }
}
```

### Lightweight Boolean Verification

If you only need a boolean check:

```typescript
import { verifyBeechWebhookSignature } from '@beechcms/client/webhooks'

const isValid = await verifyBeechWebhookSignature({
  payload: rawBodyString,
  signature: req.headers['x-beechcms-signature'],
  secret: process.env.BEECH_WEBHOOK_SECRET,
})

if (!isValid) {
  res.status(401).send('Unauthorized')
  return
}
```

---

## Inbound Webhook Reception (QStash)

BeechCMS also supports inbound secure webhooks for queue processing. The endpoint `/api/webhooks/qstash` verifies incoming Upstash signatures with rotation support (`currentSigningKey` and `nextSigningKey`), preventing unauthorized triggers of background jobs and email tasks.
