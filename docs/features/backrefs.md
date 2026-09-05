---
title: Relationships & Bidirectional Backrefs
description: Graph-aware relation mapping, reverse lookups, and referential integrity guards in BeechCMS.
---

# Relationships & Bidirectional Backrefs

In traditional content management systems, relationships are one-way: an Article references an Author by ID, but the Author has no inherent awareness of which Articles reference them without running expensive, unbounded table scans.

BeechCMS solves this with **Automatic Bidirectional Backrefs**:
- When Seeds declare relations (`type: 'relation'`, targeting another Seed), the Botanical Engine registers an in-memory graph mapping all inbound and outbound edges.
- Each Fruit automatically knows every other record in the system that links to it.
- The CMS safeguards against accidental broken links, cascading delete failures, and orphaned data.

<p align="center">
  <img src="/images/backrefs-graph-pipeline.svg" alt="BeechCMS Bidirectional Relationship & Backref Indexing" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Defining Relations in Seeds

Relations are declared using standard Seed branches:

```typescript
import { defineSeed } from '@beechcms/core'

export const ArticleSeed = defineSeed({
  slug: 'articles',
  name: 'Articles',
  branches: [
    { alias: 'title', type: 'text', required: true },
    {
      alias: 'author',
      type: 'relation',
      targetSeed: 'authors', // [!code highlight]
      required: true,
    },
    {
      alias: 'categories',
      type: 'relation',
      targetSeed: 'categories', // [!code highlight]
      multiple: true,
    }
  ]
})
```

At engine boot, BeechCMS inspects all registered seeds and builds an immutable `backrefMap`. No manual junction configuration or reverse-index tables are needed.

---

## The Backrefs API

You can query all incoming relationships for any record using the `/backrefs` endpoint:

```http
GET /api/content/:targetSlug/:targetId/backrefs
Authorization: Bearer <JWT_TOKEN>
```

### Response Example

```json
{
  "groups": [
    {
      "sourceSlug": "articles",
      "branchAlias": "author",
      "totalCount": 12,
      "items": [
        { "id": "art_01", "title": "Building Edge CMS with Cloudflare" },
        { "id": "art_02", "title": "Understanding Botanical Seeds" },
        { "id": "art_03", "title": "Direct-to-R2 Upload Architecture" }
      ]
    },
    {
      "sourceSlug": "projects",
      "branchAlias": "lead_contributor",
      "totalCount": 2,
      "items": [
        { "id": "proj_10", "title": "BeechCMS Core" },
        { "id": "proj_20", "title": "Botanical UI Kit" }
      ]
    }
  ]
}
```

### Deep Pagination

For high-volume relations, clients can paginate specific inbound edges:

```http
GET /api/content/authors/auth_123/backrefs?group=articles:author&page=2&limit=20
```

---

## Dashboard Integration

In the BeechCMS React Dashboard, backrefs are integrated into two critical workflows:

### 1. "Referenced By" Inspector
When editing any record in the Entry Editor, a sidebar tab displays all incoming references grouped by source collection. Editors can click through to related records instantly.

### 2. Deletion Guard & Orphan Prevention
When an editor attempts to delete a record:
- The system queries inbound backrefs in real-time.
- If other records depend on this entry, the **Delete Confirmation Dialog** blocks unconsidered deletions and lists the dependent records.
- Prevents broken relationships on frontend client applications before they happen.

---

## Frontend Querying with the Client SDK

When querying data via `@beechcms/client`, relations can be populated or queried bilaterally:

```typescript
import { createBeechClient } from '@beechcms/client'

const client = createBeechClient({
  baseUrl: 'https://cms.example.com',
  apiKey: 'beech_pub_...'
})

// Query author with resolved articles
const author = await client.content('authors').get('auth_123', {
  populate: ['articles']
})
```
