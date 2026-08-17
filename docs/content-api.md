---
title: Content API & SDK
group: User & Builder Guide
category: Content API & SDK
---

# Content API & SDK

BeechCMS provides an edge-native **Public REST API** and a typed **TypeScript SDK (`@beechcms/client`)** to fetch, query, and submit content (Frutti) from any frontend application—including Next.js, Astro, Nuxt, SvelteKit, Remix, and mobile clients.

## Overview & Architecture

When you build a website or application powered by BeechCMS:
- The CMS engine runs at the edge on Cloudflare Workers.
- Your frontend communicates directly with the Public API using lightweight HTTP requests or the SDK.
- Cold starts are sub-millisecond, and responses are delivered globally from the nearest Cloudflare edge location.

<p align="center">
  <img src="/images/api-architecture-pipeline.svg" alt="BeechCMS Content API & SDK Architecture" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

## Authentication

Public endpoints are authenticated using API keys passed via the `X-API-Key` request header.

| Action | Header | Key Variable (`wrangler.jsonc`) |
| :--- | :--- | :--- |
| **Read Content (`GET`)** | `X-API-Key: <key>` | `PUBLIC_READ_API_KEY` |
| **Submit Forms (`POST`)** | `X-API-Key: <key>` | `PUBLIC_WRITE_API_KEY` |

> [!NOTE]
> Only Seeds with `allowPublicRead: true` or `allowPublicPost: true` are accessible via the Public API. Internal or private Seeds remain securely locked.

## Schema Discovery

Your frontend can inspect the available content structure dynamically:

```http
GET /api/v1/public/schema
X-API-Key: YOUR_PUBLIC_READ_KEY
```

**Example Response**:

```json
{
  "seeds": [
    {
      "slug": "posts",
      "label": "Posts",
      "allowPublicRead": true,
      "allowDrafts": true,
      "branches": [
        { "id": "br_pst1", "alias": "title", "type": "text", "required": true },
        { "id": "br_pst2", "alias": "slug", "type": "text", "required": true },
        { "id": "br_pst3", "alias": "cover_image", "type": "file" },
        { "id": "br_pst4", "alias": "author_id", "type": "relation", "targetSeed": "authors" },
        { "id": "br_pst5", "alias": "body", "type": "richtext" }
      ]
    }
  ]
}
```

## Fetching Content

### Listing Fruits

Fetch a paginated list of published items:

```http
GET /api/v1/public/posts?page=1&limit=10&orderBy=created_at&orderDir=desc
X-API-Key: YOUR_PUBLIC_READ_KEY
```

**Response Format (`200 OK`)**:

```json
{
  "data": [
    {
      "id": "c7a82e9b-4321-4f8a-92bf-304918239012",
      "slug": "announcing-spring-release",
      "status": "published",
      "created_at": 1741507200,
      "updated_at": 1741507200,
      "title": "Announcing Our Spring Product Release",
      "cover_image": "https://api.example.com/api/media/cover.webp",
      "author_id": "aut_8921a9c1",
      "body": "<p>We are excited to share new edge capabilities.</p>"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "returned": 1,
    "seed": "posts"
  }
}
```

### Fetching a Single Fruit by ID

```http
GET /api/v1/public/posts/c7a82e9b-4321-4f8a-92bf-304918239012
X-API-Key: YOUR_PUBLIC_READ_KEY
```

## Filtering & Querying

BeechCMS supports powerful structured filtering using URL-encoded JSON parameters.

### Filter Syntax

```http
GET /api/v1/public/posts?filter={"logic":"AND","where":[{"field":"slug","op":"eq","value":"announcing-spring-release"}]}
X-API-Key: YOUR_PUBLIC_READ_KEY
```

### Supported Operators

| Operator | Description | Example |
| :--- | :--- | :--- |
| `eq` | Exact match | `{ "field": "slug", "op": "eq", "value": "my-post" }` |
| `neq` | Not equal | `{ "field": "status", "op": "neq", "value": "archived" }` |
| `contains` | Substring search | `{ "field": "title", "op": "contains", "value": "Edge" }` |
| `in` | Value in array | `{ "field": "category", "op": "in", "value": ["tech", "design"] }` |
| `gt` / `gte` | Greater than (or equal) | `{ "field": "price", "op": "gte", "value": 50 }` |
| `lt` / `lte` | Less than (or equal) | `{ "field": "created_at", "op": "lte", "value": 1741507200 }` |

### Combining Conditions (`AND` / `OR`)

```json
{
  "logic": "AND",
  "where": [
    { "field": "featured", "op": "eq", "value": true },
    { "field": "category", "op": "in", "value": ["tutorials", "releases"] }
  ]
}
```

## Submitting Public Forms

For contact forms, newsletter signups, or lead capture, configure a Seed with `allowPublicPost: true`:

```http
POST /api/v1/public/contact
X-API-Key: YOUR_PUBLIC_WRITE_KEY
Content-Type: application/json

{
  "name": "Alex Rivera",
  "email": "alex@example.com",
  "message": "We would like to request a product demo."
}
```

**Response (`201 Created`)**:

```json
{
  "success": true,
  "id": "cnt_9812401923"
}
```

> [!TIP]
> You can attach an **Automation Rule** to the `contact` Seed so that every new form submission instantly triggers an email notification via Resend.

## TypeScript SDK (`@beechcms/client`)

The official client SDK provides full TypeScript type safety, autocomplete, and promise-based querying.

### Installation

```bash
pnpm add @beechcms/client
# or npm install @beechcms/client
```

### Initializing the Client

```typescript
import { createClient } from '@beechcms/client'

export const beech = createClient({
  baseUrl: process.env.BEECH_API_URL || 'https://my-cms.workers.dev',
  apiKey: process.env.BEECH_READ_KEY || '',
})
```

### Querying Content

```typescript
// Define your Fruit TypeScript interface
export interface Post {
  id: string
  slug: string
  title: string
  cover_image?: string
  author_id?: string
  body: string
  created_at: number
}

// 1. Fetch paginated posts
const { data: posts, meta } = await beech.content<Post>('posts').findMany({
  page: 1,
  limit: 10,
  orderBy: 'created_at',
  orderDir: 'desc',
})

// 2. Fetch a single post by slug
const post = await beech.content<Post>('posts').findOne({
  where: { slug: 'announcing-spring-release' },
})

// 3. Submit a contact form
await beech.content('contact').create({
  name: 'Alex Rivera',
  email: 'alex@example.com',
  message: 'Hello from website!',
})
```

## Media & CDN Delivery

Images and files stored in Cloudflare R2 can be served directly or through a CDN domain:

- **Proxy Endpoint**: `https://my-cms.workers.dev/api/media/<file-key>`
- **Direct CDN Domain**: If you configure `MEDIA_CDN_URL` (e.g. `https://cdn.my-site.com`) in `wrangler.jsonc`, media URLs will resolve directly to your custom CDN domain with global edge caching.

```typescript
// Example: Rendering responsive images in Next.js / Astro
<img
  src={post.cover_image}
  alt={post.title}
  loading="lazy"
  className="w-full rounded-lg object-cover"
/>
```