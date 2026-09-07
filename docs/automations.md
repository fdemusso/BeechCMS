---
title: Automations Engine
group: User & Builder Guide
category: Features
---

# Automations Engine

Automations in BeechCMS allow you to trigger automated workflows—such as sending transactional emails, dispatching webhooks, updating fields, or generating new records—based on content lifecycle events (`create`, `update`, `delete`) or recurring schedules (`cron`).

Automations are scoped per Seed and configured visually in the dashboard: open any content collection from the sidebar (e.g. **Articoli**, **Customers**) and click the **Automations** button in the top toolbar to open the lateral automations panel.

## Architecture & Triggers

An automation rule consists of three building blocks:

- **Trigger**: The event that initiates the workflow.
  - **Lifecycle Events**: `create`, `update`, or `delete` on any specified Seed.
  - **Schedule (`cron`)**: Recurring time intervals (e.g. daily summaries, weekly cleanups).
- **Conditions**: Optional logical rules (e.g. `status == 'published'`, `priority == 'high'`) that must evaluate to true for execution to proceed.
- **Actions**: A sequential pipeline of operations executed in exact order.

```
Trigger (Create/Update/Cron)  ──►  Conditions (Filter Rules)  ──►  Actions Pipeline
```

## Supported Actions

BeechCMS provides five core action types:

| Action | Function | Example Use Case |
| :--- | :--- | :--- |
| `send_mail` | Sends transactional HTML emails via [Resend](https://resend.com/) | Send confirmation emails on new contact form submissions |
| `webhook` | Dispatches secure HTTP requests to external APIs | Notify Slack, Discord, Zapier, or n8n of new publications |
| `edit_field` | Updates field values on an existing Fruit | Auto-assign tickets or increment view counters |
| `create_entry` | Spawns a new Fruit in any Seed | Generate an audit record or welcome ticket |
| `set_variable` | Preloads data from other Seeds for use in later actions | Fetch author details or calculate category aggregates |

## Variables & Templating

Actions execute sequentially. You can interpolate data from the triggering item (`this`) or from declared variables using the double-brace syntax `\{\{this.field\}\}`.

### Single Record Mode

Declare a variable with a `fixed_id` (either a literal ID or an interpolated value like `\{\{this.author_id\}\}`):

- `\{\{author\}\}`: The entire object (or `null` if not found).
- `\{\{author.name\}\}`: The author's name.
- `\{\{author.email\}\}`: The author's email address.

### Collection Mode & Aggregates

When `fixed_id` is omitted, `set_variable` loads up to 1,000 records from a target Seed, allowing powerful aggregates and navigation:

- **`\{\{posts.count\}\}`**: Total count of matching items.
- **`\{\{orders.sum.total\}\}`**: Sum of a numeric Branch (`total`).
- **`\{\{orders.avg.total\}\}`**: Average value.
- **`\{\{posts.min.publishedAt\}\}`**: Minimum date/value.
- **`\{\{posts.max.publishedAt\}\}`**: Maximum date/value.
- **`\{\{tags.pluck.name\}\}`**: Comma-separated list of up to 100 values.
- **`\{\{posts.firstone.title\}\}`**: The title of the first item in the collection.
- **`\{\{posts.lastone.id\}\}`**: The ID of the last item in the collection.

### Inline Filtering & Selectors

You can apply inline filters directly inside template tags:

- **Inline Filter**: `\{\{posts.(status=published).count\}\}` (counts only published items).
- **Date Comparison**: `\{\{posts.(publishedAt>1740000000).count\}\}`.
- **Array Selector**: `\{\{posts.array[art-001,art-002].count\}\}`.

## Webhook Integration

Webhooks allow seamless integration with external automation platforms (n8n, Make, Zapier, or custom backends).

### Payload Example

```json
{
  "event": "content.published",
  "trigger": {
    "title": "\{\{this:title\}\}",
    "slug": "\{\{this:slug\}\}",
    "status": "\{\{this:status\}\}",
    "publishedAt": "\{\{this:publishedAt\}\}"
  },
  "collection": {
    "total_articles": "\{\{articles.count\}\}",
    "published_count": "\{\{articles.(status=published).count\}\}",
    "all_titles": "\{\{articles.pluck.title\}\}"
  },
  "latest": {
    "id": "\{\{articles.firstone.id\}\}",
    "title": "\{\{articles.firstone.title\}\}"
  }
}
```

### Security & SSRF Protection

BeechCMS enforces strict security rules on all outbound webhooks:

- **HTTPS Required**: Insecure `http://` webhook endpoints are rejected.
- **SSRF Defense**: Private and loopback IP ranges (`localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.0.0/16`) are blocked to prevent attacks against cloud infrastructure.

### HMAC Signature Verification

Every outgoing webhook includes the header `X-BeechCMS-Signature: sha256=<hex>` when `WEBHOOK_SECRET` is configured in your Worker.

Set the secret in production:

```bash
npx wrangler secret put WEBHOOK_SECRET --env production
```

#### Verification Example (Node.js)

```typescript
import { createHmac } from 'node:crypto'

export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  return expected === signature
}

// In your API route handler:
const rawBody = await request.text()
const signature = request.headers.get('X-BeechCMS-Signature') ?? ''

if (!verifyWebhookSignature(rawBody, signature, process.env.WEBHOOK_SECRET!)) {
  return new Response('Invalid signature', { status: 403 })
}
```

## Email Delivery

When using the `send_mail` action, BeechCMS uses [Resend](https://resend.com/) by default to dispatch transactional emails with zero latency.

1. Ensure `RESEND_API_KEY` is configured in your environment.
2. In the automation builder, configure **To**, **Subject**, and **Body** using dynamic template placeholders (e.g. `Hello \{\{this.name\}\}, thank you for your inquiry!`).
3. Emails are dispatched asynchronously with automatic retries.

> [!TIP] Custom Email Providers
> While Resend is configured as the default delivery engine, BeechCMS uses a modular `EmailProvider` architecture. You can easily connect SMTP (such as Mailpit in local development), SendGrid, Postmark, Mailgun, or any custom provider. Learn how in the **[Email Module Guide](./email-module.md)**.
