---
title: Client SDK
group: Official SDKs
category: Client SDK
---

# Client SDK

`@beechcms/client` is the official TypeScript SDK for fetching, querying, and managing BeechCMS content across any JavaScript runtime (Next.js Server Components, Astro, Remix, Nuxt, Node.js, Cloudflare Workers, and mobile apps).

To ensure zero bundle bloat and eliminate frontend credential leakage, the SDK implements **architectural submodule segregation** into dedicated, purpose-built subpaths:

- **`@beechcms/client/browser`**: Safe read-only client for client-side and browser environments. Mutation methods (`create`, `update`) are physically omitted from both types and bundle runtime.
- **`@beechcms/client/server`**: Read and write client with mutation operations (`create`, `update`), administrative authentication, and advanced fetch options (`next` cache tags, revalidation, AbortSignal). Deletion is intentionally omitted from public client scopes.
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
| **`@beechcms/client/browser`** | Read-Only Client | Browsers, SPAs, Client Components, Mobile | `createBeechBrowserClient()`, `createBeechClient()`, `list()`, `get()` *(no mutation methods)* |
| **`@beechcms/client/server`** | Read & Write Client | Node.js, Next.js Server Components, Workers | `createBeechServerClient()`, `createBeechClient()`, `list()`, `get()`, `create()`, `update()` |
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
const result = await beech.content('articles').list({
  page: 1,
  limit: 10,
  filter: {
    status: { eq: 'published' },
    category: { eq: 'technology' },
  },
  sort: { created_at: 'desc' },
})

if (!result.error) {
  const { data: posts, meta } = result.data
  console.log(`Loaded ${posts.length} of ${meta.total} posts:`, posts)
} else {
  // Normalized RFC 9457 problem details
  console.error(`Error (${result.error.status}): ${result.error.title} - ${result.error.detail}`)
}
```

### 2. Fetch Single Entry by Slug or ID

```typescript
// Lookup by URL slug
const slugResult = await beech.content('articles').get({ slug: 'spring-release' })

// Lookup by UUID
const idResult = await beech.content('articles').get({ id: 'c7a82e9b-4321-4f8a-92bf-304918239012' })

if (!slugResult.error) {
  const post = slugResult.data.data
  console.log(post.title, post.body)
}
```

### Supported Query Operators & Options

When calling `.list()`, the `filter` field supports the following operators:

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

#### Additional Query Options

- **`logic`**: Combine filters with `'AND'` (default) or `'OR'` (e.g. `{ logic: 'OR', filter: { ... } }`).
- **`sort`**: Accepts an object mapping field to `'asc' | 'desc'`. The query builder maps the first specified key to `orderBy` and `orderDir`.
- **`limit`**: Maximum number of records to return. Automatically capped at `100` by the query builder.
- **`page`**: 1-based page number for pagination.
- **`search`**: Full-text keyword search query across configured searchable fields.
- **`fields`**: Array of column names to project (e.g. `['id', 'title', 'slug']`).
- **`latest`**: Shorthand integer limit to fetch the most recent entries.

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
const result = await beechAdmin.content('articles').create({
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
const result = await beechAdmin.content('articles').update(
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

Methods support an optional `RequestOptions` parameter to configure Next.js cache revalidation tags, fetch cache modes, abort signals, or custom HTTP headers:

- For `.list(query?, options?)`, `.get(selector, options?)`, and `.create(input, options?)`, `RequestOptions` is passed as the **second** argument.
- For `.update(id, input, options?)`, `RequestOptions` is passed as the **third** argument.

```typescript
// Revalidation with .list() (second argument)
const result = await beechAdmin.content('articles').list(
  { limit: 20 },
  {
    next: {
      revalidate: 3600, // Revalidate every hour in Next.js
      tags: ['articles'],
    },
    headers: {
      'X-Custom-Client': 'Website-SSR',
    },
    signal: AbortSignal.timeout(5000), // 5-second abort signal
  },
)

// Custom audit header with .update() (third argument)
const updateResult = await beechAdmin.content('articles').update(
  'c7a82e9b-4321-4f8a-92bf-304918239012',
  { title: 'Announcing BeechCMS 1.0 (Patched)' },
  { headers: { 'X-Audit-Reason': 'editorial-fix' } },
)
```

---

## Type Safety & Generics

Pass your Seed schema TypeScript interfaces to either `createBeechBrowserClient` or `createBeechServerClient` for full IDE autocomplete and compile-time validation:

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
const listRes = await beech.content('articles').list()
if (!listRes.error) {
  // listRes.data.data is typed as Article[]
  const firstTitle = listRes.data.data[0].title
}
```

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
  const result = await beech.content('articles').get({ slug })
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
  const result = await beech.content('articles').get({ slug })
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
const result = await beech.content('articles').list()

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
