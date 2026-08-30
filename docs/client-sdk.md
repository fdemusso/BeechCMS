---
title: Client SDK
group: Official SDKs
category: Client SDK
---

# Client SDK

`@beechcms/client` is the official TypeScript HTTP client for fetching, querying, and managing BeechCMS content across any JavaScript runtime (Next.js Server Components, Astro, Remix, Nuxt, Node.js, and mobile apps).

---

## Installation

```bash
pnpm add @beechcms/client
# or
npm install @beechcms/client
```

---

## Quick Start

Initialize the client with your BeechCMS API URL and public API key:

```typescript
import { createBeechClient } from '@beechcms/client'

export const beech = createBeechClient({
  baseUrl: process.env.BEECH_API_URL || 'https://api.yourdomain.com',
  apiKey: process.env.BEECH_READ_API_KEY || '',
})
```

---

## Fetching Content

### 1. List Entries with Filters & Pagination

```typescript
// Fetch paginated articles with filtering and sorting
const result = await beech.content('articoli').list({
  page: 1,
  limit: 10,
  filter: {
    status: { eq: 'published' },
    category: { eq: 'technology' },
  },
  sort: { createdAt: 'desc' },
})

if (result.ok) {
  const { data: posts, meta } = result.data
  console.log(`Loaded ${posts.length} of ${meta.total} posts`)
} else {
  console.error('Fetch error:', result.error.message)
}
```

### 2. Fetch Single Entry by Slug or ID

```typescript
// Lookup by URL slug
const slugResult = await beech.content('articoli').get({ slug: 'spring-release' })

// Lookup by UUID
const idResult = await beech.content('articoli').get({ id: 'c7a82e9b-4321-4f8a-92bf-304918239012' })

if (slugResult.ok) {
  const post = slugResult.data.data
  console.log(post.title, post.body)
}
```

---

## Type Safety & Generics

Pass your Seed schema TypeScript interfaces to `createBeechClient` for full IDE autocomplete and compile-time type validation:

```typescript
// Define your content models
export interface Post {
  id: string
  slug: string
  title: string
  cover_image?: string
  views: number
  created_at: number
}

export interface Author {
  id: string
  name: string
  avatar?: string
}

// Registry map linking Seed slugs to interfaces
export interface AppContentRegistry {
  articoli: Post
  autori: Author
}

// Typed client instance
export const beech = createBeechClient<AppContentRegistry>({
  baseUrl: 'https://api.yourdomain.com',
  apiKey: process.env.BEECH_READ_API_KEY!,
})

// Auto-completed and strongly typed!
const { data } = await beech.content('articoli').list()
// data.data is inferred as Post[]
```

---

## Webhook Signature Verification

When receiving webhooks from BeechCMS automation rules, verify the payload integrity using `verifyBeechSignature`:

```typescript
import { verifyBeechSignature } from '@beechcms/client'

export async function handleWebhook(request: Request) {
  const signature = request.headers.get('x-beech-signature') || ''
  const rawBody = await request.text()

  const isValid = await verifyBeechSignature({
    secret: process.env.BEECH_WEBHOOK_SECRET!,
    signature,
    rawBody,
  })

  if (!isValid) {
    return new Response('Unauthorized Webhook Signature', { status: 401 })
  }

  const payload = JSON.parse(rawBody)
  console.log('Verified event received:', payload.event, payload.entry)

  return new Response('OK', { status: 200 })
}
```

---

## Framework Integration

### Next.js App Router (Server Components)

```tsx
// app/blog/page.tsx
import { beech } from '@/lib/beech'

export const revalidate = 60 // Revalidate every 60 seconds

export default async function BlogPage() {
  const result = await beech.content('articoli').list({
    limit: 12,
    sort: { createdAt: 'desc' },
  })

  if (!result.ok) {
    return <div>Failed to load articles.</div>
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Latest Articles</h1>
      <div className="grid gap-6">
        {result.data.data.map((post) => (
          <article key={post.id} className="border p-4 rounded-lg">
            <h2 className="text-xl font-semibold">{post.title}</h2>
          </article>
        ))}
      </div>
    </main>
  )
}
```

---

## Related Guides

- [Forms SDK (@beechcms/forms-react)](/forms-sdk) — Interactive React form components and hooks with invisible anti-bot defenses.
- [Public REST API](/content-api) — Direct HTTP endpoints, query parameter specifications, and authentication headers.
- [Automations](/automations) — Triggering webhooks and notifications on content changes.
