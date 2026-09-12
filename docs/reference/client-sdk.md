---
title: Client SDK
group: Official SDKs
category: Client SDK
---

# Client SDK

`@beechcms/client` is the official TypeScript SDK for fetching, querying, and managing BeechCMS content across any JavaScript runtime (Next.js Server Components, Astro, Remix, Nuxt, Node.js, Cloudflare Workers, and mobile apps).

To ensure zero bundle bloat and eliminate frontend credential leakage, the SDK implements **architectural submodule segregation** into dedicated, purpose-built subpaths:

Every read goes through one entry point — `client.collection(seed)` — which returns a **typed fluent query builder** that compiles to the documented [Public REST API](/reference/public-api) query string. There is no second query language: `.where()`, `.orderBy()`, `.include()` and friends serialize into the same `filter`, `orderBy`, `include` parameters you could type by hand.

- **`@beechcms/client/browser`**: Safe read-only client for client-side and browser environments. Mutation methods (`create`, `update`) are physically omitted from both types and bundle runtime.
- **`@beechcms/client/server`**: Read and write client with mutation operations (`create`, `update`) merged onto the same fluent builder, administrative authentication, and advanced fetch options (`next` cache tags, revalidation, AbortSignal). Deletion is intentionally omitted from public client scopes.
- **`@beechcms/client/webhooks`**: Dedicated, zero-dependency submodule for HMAC-SHA256 signature verification (`verifyBeechWebhookSignature`), error handling (`WebhookVerificationError`), and strongly typed event deserialization (`constructWebhookEvent<T>`).
- **`@beechcms/client/richtext`**: Isomorphic, zero-dependency TipTap AST HTML renderer (`renderRichText` / `renderRichTextHtml`), plain-text extractor (`richTextToPlainText` / `extractPlainText`), and AST normalizer/sanitizer utilities (`normalizeRichtextDocument`, `escapeHtml`, `isSafeUrl`).
- **`@beechcms/client`**: Root entrypoint exporting shared contracts, TypeScript types (`BeechResult`, `BeechProblem`, `ListQuery`, `ListMeta`, `Listable`, `Single`, `RequestOptions`, `BeechClientConfig`), query serializer (`buildSearchParams`), and re-exporting webhook signature utilities.

---

## Installation

```bash
pnpm add @beechcms/client
# or
npm install @beechcms/client
```

---

## Architecture & Submodule Overview

| Entrypoint | Primary Purpose | Environment | Exposed Operations / Utilities |
| :--- | :--- | :--- | :--- |
| **`@beechcms/client/browser`** | Read-Only Client | Browsers, SPAs, Client Components, Mobile | `createBeechBrowserClient()`, `createBeechClient()`, `collection()` → `.list()` / `.first()` *(no mutation methods)* |
| **`@beechcms/client/server`** | Read & Write Client | Node.js, Next.js Server Components, Workers | `createBeechServerClient()`, `createBeechClient()`, `collection()` → `.list()` / `.first()` / `.create()` / `.update()` |
| **`@beechcms/client/webhooks`** | Webhook Verification | Node.js, Edge Runtimes, Serverless | `verifyBeechWebhookSignature()`, `constructWebhookEvent<T>()`, `WebhookVerificationError`, `BEECH_SIGNATURE_HEADER` |
| **`@beechcms/client/richtext`** | TipTap AST Rendering | Universal (Node, Edge, Browser) | `renderRichText()`, `renderRichTextHtml()`, `richTextToPlainText()`, `extractPlainText()`, `normalizeRichtextDocument()`, `escapeHtml()`, `isSafeUrl()` |
| **`@beechcms/client`** | Core Types & Contracts | Universal | `buildSearchParams()`, `BeechResult<T>`, `BeechProblem`, `RequestOptions`, `ListQuery`, `ListMeta`, Webhook utilities |

---

## Browser Client (`@beechcms/client/browser`)

The browser entrypoint is strictly read-only. It is designed for client-side web applications where read tokens (`PUBLIC_READ_API_KEY`) are safe to expose, but mutation endpoints and write credentials must **never** be bundled.

### Quick Start

```typescript
import { createBeechBrowserClient } from '@beechcms/client/browser'
// Alternatively: import { createBeechClient } from '@beechcms/client/browser'

export const beech = createBeechBrowserClient({
  baseUrl: process.env.NEXT_PUBLIC_BEECH_API_URL || 'https://api.yourdomain.com',
  apiKey: process.env.NEXT_PUBLIC_BEECH_READ_KEY!,
})
```

> [!NOTE]
> `apiKey` and `baseUrl` are required non-empty strings. Omitting them or providing an empty string will throw an initialization error.

### 1. List Entries with Filters & Pagination

```typescript
// Fetch published articles in descending chronological order
const result = await beech
  .collection('articles')
  .where({ status: 'published', category: 'technology' })
  .orderBy('created_at', 'desc')
  .limit(10)
  .page(1)
  .list()

if (!result.error) {
  const { data: posts, meta } = result.data
  console.log(`Loaded ${posts.length} of ${meta.total} posts:`, posts)
} else {
  // Normalized RFC 9457 problem details
  console.error(`Error (${result.error.status}): ${result.error.title} - ${result.error.detail}`)
}
```

### 2. Fetch a Single Entry by Slug or ID

`.first()` applies `limit=1` and unwraps the list response into a `Single<T>`:

```typescript
// Lookup by URL slug
const slugResult = await beech.collection('articles').where({ slug: 'spring-release' }).first()

// Lookup by UUID
const idResult = await beech
  .collection('articles')
  .where({ id: 'c7a82e9b-4321-4f8a-92bf-304918239012' })
  .first()

if (!slugResult.error) {
  const post = slugResult.data.data
  console.log(post.title, post.body)
}
```

> [!IMPORTANT]
> An empty result is **not** `null`: `.first()` returns a `404` `BeechProblem` with `type: 'not_found'`. Branch on `result.error?.status === 404` to tell "no match" apart from a transport or authorization failure.

---

## Fluent Query Builder

`collection(seed)` returns a `FluentQuery<TRow>`. Every method returns the same builder (chainable, mutating — one builder is one query), and nothing is sent until `.list()` or `.first()` is awaited.

### Method reference

| Method | Compiles to | Notes |
| :--- | :--- | :--- |
| `.where(filter)` | `filter` (JSON `{logic, where[]}`) | Repeated calls merge field-by-field |
| `.logic('AND' \| 'OR')` | `filter.logic` | Combines every condition in the chain. Default `AND` |
| `.whereRelation(alias, subquery)` | nested `in` condition inside `filter` | Filters through a relation target — see below |
| `.orderBy(field, 'asc' \| 'desc')` | `orderBy` + `orderDir` | Single sort key; a second call **replaces** the first. Direction defaults to `desc` |
| `.search(term)` | `search` | Full-text search across searchable branches |
| `.select(fields)` | `fields` | Projection; typed against `keyof TRow` |
| `.include(relations)` | `include` | Relation expansion, depth 1, max 3 branches |
| `.limit(n)` | `limit` | Clamped to `100` by the serializer |
| `.page(n)` | `page` | 1-based |
| `.list(options?)` | `GET /api/v1/public/:seed` | Resolves `BeechResult<Listable<TRow>>` |
| `.first(options?)` | same, with `limit=1` | Resolves `BeechResult<Single<TRow>>` |
| `.build()` | — | Returns the `URLSearchParams` without issuing a request. Useful for debugging and cache keys |

```typescript
// Inspect exactly what the chain sends — no request is made
const params = beech.collection('articles').where({ views: { gte: 100 } }).orderBy('views').build()
console.log(params.toString())
// filter=%7B%22logic%22%3A%22AND%22%2C%22where%22%3A%5B...&orderBy=views&orderDir=desc
```

### Supported Filter Operators

`.where()` accepts a `{ field: comparator }` map. Comparators support the following operators:

| Operator | Description | Example |
| :--- | :--- | :--- |
| `eq` / `neq` | Equal / Not equal | `{ status: { eq: 'published' } }` |
| `gt` / `gte` | Greater than / Greater than or equal | `{ views: { gte: 100 } }` |
| `lt` / `lte` | Less than / Less than or equal | `{ price: { lte: 50 } }` |
| `contains` / `not_contains` | Substring match | `{ title: { contains: 'Release' } }` |
| `starts_with` / `ends_with` | String prefix / suffix | `{ slug: { starts_with: 'guide-' } }` |
| `in` / `not_in` | Set inclusion | `{ category: { in: ['news', 'updates'] } }` |
| `is_empty` / `is_not_empty` | Null or empty check | `{ coverImage: { is_not_empty: true } }` |
| `has_tag` / `has_any_tag` / `has_all_tags` | Tag containment | `{ tags: { has_any_tag: ['typescript', 'api'] } }` |

> [!TIP]
> **Scalar Equality Shorthand:** For simple equality filters, you can pass scalar values directly (e.g. `{ status: 'published' }` is automatically expanded to `{ status: { eq: 'published' } }` by the query builder).

An invalid operator (`{ price: { bogus: 1 } }`) throws a `TypeError` at serialization time — before any request leaves the process.

```typescript
// Combine several axes in one chain
const result = await beech
  .collection('articles')
  .where({ views: { gte: 100 }, tags: { has_any_tag: ['typescript', 'api'] } })
  .search('edge rendering')
  .select(['id', 'title', 'slug', 'views'])
  .orderBy('views', 'desc')
  .limit(20)
  .list()
```

### Relation Expansion (`.include()`)

`.include()` asks the server to resolve related entries in the same round trip, removing the N+1 follow-up requests. Expanded targets arrive under `_includes` on each entry, keyed by relation alias — the raw foreign-key value stays untouched at the root:

```typescript
const result = await beech
  .collection('posts')
  .where({ slug: 'my-first-post' })
  .include(['category_id', 'related_posts'])
  .first()

if (!result.error) {
  const post = result.data.data as Post & {
    _includes?: { category_id?: Category; related_posts?: Post[] }
  }

  post.category_id           // ' 8a01f92e-…' — the raw id, always present
  post._includes?.category_id?.name   // 'Technology' — the expanded target
}
```

Server-side limits (enforced, not clamped silently):

- **Depth 1 only** — `include(['category_id.author'])` is refused with `400 invalid-include`.
- **Max 3 branches** per request.
- **Public policy gate** — a branch expands only if its resolved policy is public *and* the target seed sets `allowPublicRead: true`. Expansion never widens what an API key may read.
- Works alongside `.select()`: omitting the foreign key from the projection still populates `_includes`.

`_includes` is not yet part of the generated row types; cast or extend the row type as shown until the schema generator publishes the relation → target map.

### Filtering Through a Relation (`.whereRelation()`)

`.whereRelation(alias, { where, logic })` filters the collection by a condition evaluated against the **target** of a declared relation branch — a server-side subquery, not a client-side second pass:

```typescript
// Posts whose category is named "Tech"
const { data } = await beech
  .collection('posts')
  .whereRelation('category_id', { where: { name: 'Tech' } })
  .list()

// Composes with ordinary conditions in the same filter payload
const recent = await beech
  .collection('posts')
  .where({ status: 'published' })
  .whereRelation('author_id', { where: { name: { contains: 'Jane' } }, logic: 'AND' })
  .orderBy('created_at', 'desc')
  .list()
```

It encodes into the existing `filter` parameter as a nested `in` condition, so no new query grammar reaches the server. Limits mirror [Relation Subquery Filters](/reference/public-api#relation-subquery-filters):

- **Max 2** relation subqueries per request; each inner `where` carries at most **5** conditions.
- **Depth 1** — a subquery inside a subquery returns `400`.
- Resolved target-id sets above **200** (or parent sets above **500**) are **refused with `400`**, never truncated.
- The inner query resolves against published entries only.

> [!NOTE]
> `.whereRelation()` types the *alias* against the row's own keys, but the inner `where` field names are `Record<string, FieldFilter>` — validated server-side, not at compile time, since the server does not yet publish a relation → target-seed type map.

---

## Server Client (`@beechcms/client/server`)

The server entrypoint is intended for secure backend environments (Next.js Server Actions, Route Handlers, Astro endpoints, Cloudflare Workers, Node.js scripts). It includes write capabilities (`create`, `update`) and supports runtime `RequestOptions` (e.g., Next.js caching and revalidation tags).

### Quick Start

```typescript
import { createBeechServerClient } from '@beechcms/client/server'
// Alternatively: import { createBeechClient } from '@beechcms/client/server'

export const beechAdmin = createBeechServerClient({
  baseUrl: process.env.BEECH_API_URL || 'https://api.yourdomain.com',
  apiKey: process.env.BEECH_WRITE_API_KEY!,
})
```

> [!NOTE]
> Authenticated requests passing `PUBLIC_WRITE_API_KEY` in `apiKey` automatically bypass public anti-bot defenses (Time-Trap tokens). For anonymous client-side web form submissions, use the dedicated [Forms SDK (`@beechcms/forms-react`)](/features/forms).

### 1. Creating Content (`create`)

Submits a `POST` request to `/api/v1/public/:seed/add`:

```typescript
const result = await beechAdmin.collection('articles').create({
  title: 'Announcing BeechCMS 1.0',
  slug: 'announcing-beechcms-1-0',
  category: 'news',
  status: 'published',
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Welcome to BeechCMS!' }],
      },
    ],
  },
})

if (!result.error) {
  console.log('Created article with ID:', result.data.data.id)
} else {
  console.error('Validation or server error:', result.error.errors || result.error.detail)
}
```

### 2. Updating Content (`update`)

Submits a `PUT` request to `/api/v1/public/:seed/edit/:id`:

```typescript
const result = await beechAdmin.collection('articles').update(
  'c7a82e9b-4321-4f8a-92bf-304918239012',
  {
    title: 'Announcing BeechCMS 1.0 (Updated)',
  },
)

if (!result.error) {
  console.log('Updated article successfully:', result.data.data)
}
```

### 3. Request Options & Next.js Revalidation

`RequestOptions` configures Next.js cache revalidation tags, fetch cache modes, abort signals, and custom HTTP headers. The query itself lives in the chain, so options are the **only** argument the terminal methods take:

- `.list(options?)` and `.first(options?)` — options are the sole argument.
- `.create(input, options?)` — **second** argument.
- `.update(id, input, options?)` — **third** argument.

```typescript
// Revalidation on a fluent read
const result = await beechAdmin
  .collection('articles')
  .where({ status: 'published' })
  .limit(20)
  .list({
    next: {
      revalidate: 3600, // Revalidate every hour in Next.js
      tags: ['articles'],
    },
    headers: {
      'X-Custom-Client': 'Website-SSR',
    },
    signal: AbortSignal.timeout(5000), // 5-second abort signal
  })

// Custom audit header with .update() (third argument)
const updateResult = await beechAdmin.collection('articles').update(
  'c7a82e9b-4321-4f8a-92bf-304918239012',
  { title: 'Announcing BeechCMS 1.0 (Patched)' },
  { headers: { 'X-Audit-Reason': 'editorial-fix' } },
)
```

---

## Type Safety & Generics

The client takes a **Seed registry** generic: a map of seed slug → row interface. `collection()` restricts its argument to the registry keys, and `.select()` / `.orderBy()` restrict theirs to the keys of the selected row.

### Recommended: generate the registry from live D1

Do not hand-maintain the registry. [`beech types generate`](/build/cli-workflows#_3-typescript-type-generation) introspects the deployed schema and writes `beech.generated.ts`, exporting `BeechDatabase` (aliased as `SeedRegistryTypes`) plus a `SCHEMA_FINGERPRINT` constant:

```bash
npx beech types generate                      # → beech.generated.ts (local D1)
npx beech types generate --remote -o src/types/beech.ts
```

```typescript
import { createBeechBrowserClient } from '@beechcms/client/browser'
import type { BeechDatabase } from './beech.generated'

export const beech = createBeechBrowserClient<BeechDatabase>({
  baseUrl: process.env.NEXT_PUBLIC_BEECH_API_URL!,
  apiKey: process.env.NEXT_PUBLIC_BEECH_READ_KEY!,
})

await beech.collection('artciles')            // ✗ compile error — not a seed slug
await beech.collection('articles').select(['titel'])  // ✗ compile error — not a branch alias
```

> [!WARNING]
> Generated types go stale the moment someone applies a schema change, and the SDK does **not** yet catch it at runtime: its `SCHEMA_FINGERPRINT` ships as an empty stub, so the `X-Schema-Revision` comparison inside the client is inert until that constant is populated at build time. Guard drift in CI instead — regenerate and fail on a dirty tree:
>
> ```bash
> npx beech types generate --remote -o src/types/beech.ts
> git diff --exit-code src/types/beech.ts   # non-zero when the committed types are stale
> ```
>
> For manifest-vs-deployed drift, `npx beech schema diff` already exits `1` on its own.

### Hand-written registry (dynamic or partial schemas)

```typescript
import type { TipTapDoc, RichtextEnvelopeV1 } from '@beechcms/client/richtext'
import { createBeechBrowserClient } from '@beechcms/client/browser'

// 1. Define content models
export interface Article {
  id: string
  slug: string
  title: string
  category: string
  body: TipTapDoc | RichtextEnvelopeV1
  cover_image?: string
  views: number
  status: 'draft' | 'published'
  created_at: number
}

export interface Author {
  id: string
  name: string
  bio?: string
}

// 2. Define the Seed registry map
export interface AppContentRegistry {
  articles: Article
  authors: Author
}

// 3. Initialize typed client
export const beech = createBeechBrowserClient<AppContentRegistry>({
  baseUrl: 'https://api.yourdomain.com',
  apiKey: process.env.NEXT_PUBLIC_BEECH_READ_KEY!,
})

// Types are automatically inferred!
const listRes = await beech.collection('articles').where({ status: 'published' }).list()
if (!listRes.error) {
  // listRes.data.data is typed as Article[]
  const firstTitle = listRes.data.data[0].title
}
```

> [!NOTE]
> The typed surface stops at the row: `.where()` field names and `.whereRelation()` inner conditions are `Record<string, FieldFilter>`, validated server-side. Untyped JavaScript consumers can omit the generic entirely — `collection()` then accepts any string and returns `Record<string, unknown>` rows.

---

## Webhook Signature Verification (`@beechcms/client/webhooks`)

BeechCMS sends HMAC-SHA256 signatures in the `x-beechcms-signature` header on automation webhook events. The `@beechcms/client/webhooks` submodule provides constant-time, zero-dependency cryptographic verification implemented entirely via standard Web Crypto (`crypto.subtle`).

### Methods & Constants

- **`constructWebhookEvent<T>(options)`**: Verifies the HMAC-SHA256 signature and returns the deserialized JSON payload typed as `T`. Throws `WebhookVerificationError` if the signature is invalid or secret/payload is missing.
- **`verifyBeechWebhookSignature(options)`**: Returns `Promise<boolean>` in constant time (`timingSafeEqual`). Never throws runtime exceptions on invalid signatures or malformed inputs.
- **`BEECH_SIGNATURE_HEADER`**: Constant string `'x-beechcms-signature'`.

### Example: Next.js App Router Webhook Route Handler

```typescript
// app/api/webhooks/beech/route.ts
import {
  BEECH_SIGNATURE_HEADER,
  constructWebhookEvent,
  WebhookVerificationError,
} from '@beechcms/client/webhooks'

interface ArticleWebhookPayload {
  event: 'entry.created' | 'entry.updated' | 'entry.published'
  seed: string
  entry: {
    id: string
    slug: string
    title: string
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get(BEECH_SIGNATURE_HEADER)
  const rawPayload = await request.text()

  try {
    const event = await constructWebhookEvent<ArticleWebhookPayload>({
      payload: rawPayload,
      signature,
      secret: process.env.BEECH_WEBHOOK_SECRET!,
    })

    console.log(`Verified webhook event "${event.event}" for entry:`, event.entry.id)

    // Trigger on-demand revalidation or sync
    return Response.json({ received: true })
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response(`Unauthorized: ${error.message}`, { status: 401 })
    }
    return new Response('Invalid webhook payload', { status: 400 })
  }
}
```

---

## TipTap RichText Rendering (`@beechcms/client/richtext`)

BeechCMS stores RichText fields as TipTap AST JSON trees wrapped in Botanical schema envelopes (`{ schemaVersion: 1, doc: { ... } }`).

The `@beechcms/client/richtext` submodule is an **isomorphic, zero-dependency renderer** that transforms TipTap ASTs into sanitized, semantic HTML and plain text without requiring `@tiptap/html`, ProseMirror, or synthetic DOM polyfills (`jsdom`). It runs universally on Cloudflare Workers, Node.js, and browsers.

### Features & Security Invariants

- **Fail-Safe Normalization:** Automatically unwraps schema envelopes (`{ schemaVersion: 1, doc }`) and raw doc objects. Invalid inputs gracefully return `""`.
- **Automatic XSS Protection:** Strict character escaping (`&`, `<`, `>`, `"`, `'`) and strict URL protocol validation (`http:`, `https:`, `mailto:`, `tel:`, or relative paths, blocking `javascript:` and `data:` schemes).
- **Full AST Support:** Headings (`h1`–`h6`, with `textAlign` support), paragraphs, blockquotes, code blocks (`<pre class="richtext-code-block"><code>`), lists (bullet, ordered, task lists with checkboxes), tables (headers, rows, cells, colspan, rowspan), horizontal rules, line breaks (`hardBreak`), images (with safe `src`, `alt`, and `title`), inline and block mathematics (`inlineMath`, `blockMath`, `mathematics`), and formatting marks (`bold`/`strong`, `italic`/`em`, `underline`/`u`, `strike`/`s`, `code`, `link`, `highlight`, `superscript`, `subscript`, and `textStyle` colors).

### API Reference

```typescript
import {
  renderRichText,
  renderRichTextHtml,         // Functional alias for renderRichText
  richTextToPlainText,
  extractPlainText,           // Functional alias for richTextToPlainText
  normalizeRichtextDocument,  // Validates and extracts AST doc from raw value or envelope
  escapeHtml,                 // Strict HTML character escaping
  isSafeUrl,                  // Strict protocol safety validator
  RICHTEXT_SCHEMA_VERSION,    // Schema version constant (1)
} from '@beechcms/client/richtext'
import type {
  TipTapDoc,
  TipTapNode,
  TipTapMark,
  TipTapMarkType,
  RichtextEnvelopeV1,
} from '@beechcms/client/richtext'
```

#### 1. Rendering Semantic HTML (`renderRichText` / `renderRichTextHtml`)

```tsx
// app/blog/[slug]/page.tsx
import { beech } from '@/lib/beech'
import { renderRichText } from '@beechcms/client/richtext'

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await beech.collection('articles').where({ slug }).first()
  if (result.error) return <div>Post not found</div>

  const post = result.data.data
  const htmlContent = renderRichText(post.body)

  return (
    <article className="prose max-w-2xl mx-auto py-8">
      <h1>{post.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </article>
  )
}
```

#### 2. Extracting Clean Plain Text (`richTextToPlainText` / `extractPlainText`)

Extracts unformatted text with whitespace separation between block elements, stripping tags and metadata. Ideal for generating SEO meta descriptions, OpenGraph summaries, and RSS feeds:

```typescript
import { richTextToPlainText } from '@beechcms/client/richtext'

const rawAst = post.body // TipTap AST or Envelope V1
const plainSnippet = richTextToPlainText(rawAst)

// Output clean snippet:
console.log(plainSnippet)
// => "Welcome to BeechCMS. In this article, we explore modern headless architecture..."

// Perfect for Next.js metadata:
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const result = await beech.collection('articles').where({ slug }).first()
  if (result.error) return { title: 'Not Found' }

  const snippet = richTextToPlainText(result.data.data.body).slice(0, 160)

  return {
    title: result.data.data.title,
    description: snippet,
  }
}
```

---

## Result Handling & RFC 9457 Problem Details

Both `@beechcms/client/browser` and `@beechcms/client/server` encapsulate network errors into a deterministic `BeechResult<T>` discriminated union (`{ data: T; error: null } | { data: null; error: BeechProblem }`). Requests **never throw unexpected network exceptions**:

```typescript
const result = await beech.collection('articles').list()

if (!result.error) {
  // TypeScript narrows result to: { data: Listable<Article>, error: null }
  console.log(result.data.data)
} else {
  // TypeScript narrows result to: { data: null, error: BeechProblem }
  console.error('HTTP Status:', result.error.status)
  console.error('Title:', result.error.title)
  console.error('Detail:', result.error.detail)

  // Validation errors array from 422 responses
  if (result.error.errors) {
    result.error.errors.forEach((err) => console.error(`${err.field}: ${err.message}`))
  }
}
```

---

## Related Guides

- [Forms SDK (@beechcms/forms-react)](/features/forms) — Interactive React form components and hooks with zero-secret invisible anti-bot defenses.
- [Public REST API](/reference/public-api) — Direct HTTP endpoints, query parameter specifications, and authentication headers.
- [Automations & Webhooks](/features/automations) — Triggering webhooks and notifications on content mutations.
