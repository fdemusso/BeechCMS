---
title: Content API (REST)
group: User & Builder Guide
category: Content API
---

# Content API (REST)

BeechCMS provides an edge-native **Public REST API** to fetch, query, and submit content directly from any frontend application or external service.

---

## Overview & Architecture

When you build a website or application powered by BeechCMS:
- The CMS engine runs at the edge on Cloudflare Workers.
- Your frontend communicates directly with the Public API using lightweight HTTP requests.
- Responses are delivered globally from the nearest Cloudflare edge location with sub-millisecond cold starts.

<p align="center">
  <img src="/images/api-architecture-pipeline.svg" alt="BeechCMS Content API Architecture" style="width: 100%; max-width: 840px; margin: 16px 0;" />
</p>

> [!TIP]
> **Prefer using typed SDKs?**
> - For data fetching in Next.js, Astro, Remix, or Node: check out the [Client SDK (@beechcms/client)](/client-sdk).
> - For interactive web forms with anti-bot defenses: check out the [Forms SDK (@beechcms/forms-react)](/forms-sdk).

---

## Authentication

Public endpoints are authenticated using API keys passed via the `X-API-Key` request header.

| Action | Header | Key Variable (`wrangler.jsonc`) |
| :--- | :--- | :--- |
| **Read Content (`GET`)** | `X-API-Key: <key>` | `PUBLIC_READ_API_KEY` |
| **Submit Forms (`POST`)** | `X-API-Key: <key>` | `PUBLIC_WRITE_API_KEY` |

> [!NOTE]
> Only Seeds with `allowPublicRead: true` or `allowPublicPost: true` are accessible via the Public API. Internal or private Seeds remain securely locked.

---

## Schema Discovery (Scoped Form Contracts)

Your frontend or form renderer can inspect the public schema definition for a specific Seed:

```http
GET /api/v1/public/posts/schema
X-API-Key: YOUR_PUBLIC_READ_KEY
```

**Example Response**:

```json
{
  "slug": "posts",
  "label": "Posts",
  "branches": [
    { "alias": "title", "type": "text", "label": "Title", "requiredOnCreate": true },
    { "alias": "cover_image", "type": "file", "label": "Cover Image" },
    { "alias": "author_id", "type": "relation", "label": "Author" },
    { "alias": "body", "type": "richtext", "label": "Content Body" }
  ]
}
```

---

## Fetching Content

### Listing Items

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

### Fetching a Single Item by ID or Slug

```http
GET /api/v1/public/posts?slug=announcing-spring-release
X-API-Key: YOUR_PUBLIC_READ_KEY
```

---

## Filtering & Querying

BeechCMS supports structured filtering using URL-encoded JSON parameters.

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

---

## Submitting Public Forms

For contact forms, newsletter signups, or lead capture:

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

> [!IMPORTANT]
> When building React web forms, use [`@beechcms/forms-react`](/forms-sdk) which automatically handles invisible anti-bot defenses (Honeypot + Time-Trap), SWR caching, and local draft restoration.

---

## Media & CDN Delivery

Images and files stored in Cloudflare R2 can be served directly or through a CDN domain:

- **Proxy Endpoint**: `https://my-cms.workers.dev/api/media/<file-key>`
- **Direct CDN Domain**: When `MEDIA_CDN_URL` is configured, media URLs resolve directly to your custom CDN domain with edge caching.