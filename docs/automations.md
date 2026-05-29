# Automations Guide

Automations in BeechCMS allow you to trigger actions—such as sending an email, firing a webhook, updating a field, or creating a new entry—based on content lifecycle events (`create`, `update`, `delete`) or a recurring schedule (`cron`).

## How Automations Work

An Automation consists of:
- **Trigger**: The event that causes the automation to run.
- **Conditions**: Optional logical checks that must pass for the automation to proceed.
- **Actions**: A sequential list of operations to execute.

Actions are executed in order. You can use the state from earlier actions in the subsequent ones by using the template grammar. The current entry that triggered the automation is always accessible using the `this` prefix (e.g. `{{this.title}}` or `{{this:title}}`).

---

## Setting Variables (`set_variable`)

Variables allow you to fetch external data from your database to use in subsequent actions. **Variables must be declared before they are used.** 

You can declare a variable using the `set_variable` action. A variable can load a single record (by providing a `fixed_id`) or an entire collection of records (by omitting `fixed_id`).

### Single-Record Mode
If you provide a `fixed_id` (which can be a literal string or an interpolated value like `{{this.author_id}}`), the variable holds a single object.
- `{{cliente}}` → the entire object (or `null` if not found)
- `{{cliente.nome}}` → a specific column value

### Collection Mode
If `fixed_id` is omitted, the variable loads the entire collection (up to 1,000 records). You can apply filters and ordering when defining the `set_variable` action. 
The collection mode returns a rich object that exposes navigation properties and aggregates over the fetched records. For example, given a variable named `test`:

#### Navigation
- `{{test.firstone.title}}`: The title of the first record in the collection.
- `{{test.lastone.id}}`: The ID of the last record.

#### Aggregates
- `{{test.count}}`: The total number of rows.
- `{{test.sum.budget}}`: The sum of the `budget` numeric branch.
- `{{test.avg.budget}}`: The average of the `budget` numeric branch.
- `{{test.min.publishedAt}}`: The minimum value.
- `{{test.max.publishedAt}}`: The maximum value.
- `{{test.pluck.title}}`: A comma-separated list of up to 100 titles.

#### Inline Conditions
You can filter collections inline within the template by appending `.(column=value)` before aggregates or navigation steps. Supported operators: `=`, `!=`, `<`, `>`, `<=`, `>=`.
- `{{test.count.(status=published)}}`: Count only the published rows.
- `{{test.(publishedAt>1740000000).count}}`: Count only recent records.
- `{{test.firstone.(status=published).title}}`: The title of the first published record.

#### Array Selectors
You can select a specific subset of items by their primary keys using `array[id1,id2]`.
- `{{test.array[art-0001,art-0002].count}}`: The count of the selected subset.
- `{{test.array[art-0001].firstone.title}}`: The title of the specific record `art-0001`.

---

## Example Webhook Payload

Here is a comprehensive webhook payload example demonstrating the rich template grammar available in BeechCMS. This payload uses the triggering entry (`this`) and a previously declared variable named `test` (a collection of articles or similar seed).

```json
{
  "trigger": {
    "title": "{{this:title}}",
    "slug": "{{this:slug}}",
    "status": "{{this:status}}",
    "publishedAt": "{{this:publishedAt}}"
  },

  "collection": {
    "count_totale": "{{test.count}}",
    "count_published": "{{test.(status=published).count}}",
    "count_recenti": "{{test.(publishedAt>1740000000).count}}",

    "sum_publishedAt": "{{test.sum.publishedAt}}",
    "avg_publishedAt": "{{test.avg.publishedAt}}",
    "min_publishedAt": "{{test.min.publishedAt}}",
    "max_publishedAt": "{{test.max.publishedAt}}",

    "tutti_i_titoli": "{{test.pluck.title}}",
    "tutte_le_metaTitle": "{{test.pluck.metaTitle}}",
    "tutte_le_descrizioni": "{{test.pluck.metaDescription}}"
  },

  "firstone": {
    "id": "{{test.firstone.id}}",
    "slug": "{{test.firstone.slug}}",
    "status": "{{test.firstone.status}}",
    "title": "{{test.firstone.title}}",
    "publishedAt": "{{test.firstone.publishedAt}}",
    "coverImage": "{{test.firstone.coverImage}}",
    "tags": "{{test.firstone.tags}}",
    "metaTitle": "{{test.firstone.metaTitle}}",
    "metaDescription": "{{test.firstone.metaDescription}}",
    "body": "{{test.firstone.body}}"
  },

  "lastone": {
    "id": "{{test.lastone.id}}",
    "slug": "{{test.lastone.slug}}",
    "status": "{{test.lastone.status}}",
    "title": "{{test.lastone.title}}",
    "publishedAt": "{{test.lastone.publishedAt}}",
    "coverImage": "{{test.lastone.coverImage}}",
    "tags": "{{test.lastone.tags}}",
    "metaTitle": "{{test.lastone.metaTitle}}",
    "metaDescription": "{{test.lastone.metaDescription}}"
  },

  "nav_con_guardia": {
    "firstone_se_published": "{{test.firstone.(status=published).title}}",
    "lastone_se_published": "{{test.lastone.(status=published).title}}",
    "firstone_se_recente": "{{test.firstone.(publishedAt>1740000000).title}}"
  },

  "array_selector": {
    "count_selezione": "{{test.array[art-0001,art-0002].count}}",
    "titolo_art0001": "{{test.array[art-0001].firstone.title}}",
    "titolo_art0002": "{{test.array[art-0002].firstone.title}}",
    "titolo_art0003": "{{test.array[art-0003].firstone.title}}"
  }
}
```

---

## Webhook Security

### URL restrictions

Beech enforces two rules on every webhook URL at schema validation time:

- **HTTPS only** — `http://` URLs are rejected.
- **No private hosts** — loopback (`127.x.x.x`, `localhost`, `::1`), RFC-1918 (`10.x`, `172.16–31.x`, `192.168.x`), link-local (`169.254.x.x`), and ULA/IPv6 local ranges are blocked to prevent SSRF attacks against cloud metadata APIs and internal services.

> **Known limitation**: DNS-based SSRF (a public hostname that resolves to a private IP) is not blocked at the schema level. Cloudflare Workers do not expose pre-fetch DNS resolution; this limitation is documented and mitigated by network-level egress controls in production.

### Webhook signature verification

Every outgoing webhook request includes the header `X-BeechCMS-Signature: sha256=<hex>` when `WEBHOOK_SECRET` is configured in the worker. The value is an HMAC-SHA256 digest of the raw request body computed with that secret.

**Set the secret in production:**

```bash
npx wrangler secret put WEBHOOK_SECRET
```

If `WEBHOOK_SECRET` is not set the header is omitted and a warning is logged once per worker instance (`[webhook] WEBHOOK_SECRET not set — outgoing webhooks are unsigned`).

### Verifying the signature — generic Node.js / Cloudflare Workers

```ts
import { createHmac } from 'node:crypto' // Node.js
// Workers: use crypto.subtle (see snippet below)

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
  return expected === signature
}

// In your handler:
const rawBody = await request.text()
const sig = request.headers.get('X-BeechCMS-Signature') ?? ''
if (!verifySignature(rawBody, sig, process.env.WEBHOOK_SECRET!)) {
  return new Response('Forbidden', { status: 403 })
}
```

**Cloudflare Workers / n8n Code node (SubtleCrypto):**

```ts
async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const sigBytes = hexToBytes(signature.replace('sha256=', ''))
  return crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body))
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  return bytes
}
```

### Verifying the signature — n8n Code node

In an n8n **Code** node placed after the webhook trigger:

```js
const body = JSON.stringify($input.first().json) // raw body as received
const signature = $input.first().headers['x-beechcms-signature'] ?? ''
const secret = 'your-webhook-secret' // use an n8n credential instead

const encoder = new TextEncoder()
const key = await crypto.subtle.importKey(
  'raw', encoder.encode(secret),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
)
const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
const computed = 'sha256=' + Array.from(new Uint8Array(sig))
  .map(b => b.toString(16).padStart(2, '0')).join('')

if (computed !== signature) throw new Error('Invalid webhook signature')
return $input.all()
```

> **Note**: n8n receives the body as a parsed JSON object. Re-serialise with `JSON.stringify` using the same field order Beech sent. For deterministic verification, use the raw body bytes from the webhook trigger node (`$input.first().binary` / `$input.first().rawBody`) if your n8n version exposes them.
