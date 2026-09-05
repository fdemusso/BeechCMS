---
title: Relationships & Bidirectional Backrefs
description: Graph-aware relation mapping, reverse lookups, and referential integrity guards in BeechCMS.
---

# Relationships & Bidirectional Backrefs

In traditional content management systems, relationships are one-way: an Article references an Author by ID, but the Author has no inherent awareness of which Articles reference them without running expensive, unbounded table scans.

BeechCMS solves this with **Automatic Bidirectional Backrefs**:
- When Seeds declare relations (`type: 'relation'`, targeting another Seed), the Botanical Engine registers an in-memory graph mapping all inbound and outbound edges at boot time.
- Reverse lookups are pre-indexed into a fast, read-only `backrefMap`.
- The CMS safeguards against accidental broken links, cascading delete failures, and orphaned records via native SQLite constraints and dashboard guards.

<p align="center">
  <img src="/images/backrefs-graph-pipeline.svg" alt="BeechCMS Bidirectional Relationship & Backref Indexing" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Defining Relations in Seeds

Relations are declared using standard Seed branches with `type: 'relation'`:

```typescript
import { defineSeed } from '@beechcms/core'

export const ArticleSeed = defineSeed({
  slug: 'articles',
  label: 'Article',
  labelPlural: 'Articles',
  displayNameAlias: 'title', // [!code highlight] Used as the human label across backrefs
  branches: [
    {
      id: 'br_title',
      alias: 'title',
      label: 'Title',
      type: 'text',
      requiredOnCreate: true,
    },
    {
      id: 'br_author',
      alias: 'author',
      label: 'Author',
      type: 'relation',
      targetSeed: 'authors', // [!code highlight]
      requiredOnCreate: true,
      onDelete: 'RESTRICT', // [!code highlight] Blocks deleting author while referenced
    },
    {
      id: 'br_categories',
      alias: 'categories',
      label: 'Categories',
      type: 'relation',
      targetSeed: 'categories', // [!code highlight]
      multiple: true, // [!code highlight] Many-to-many relationship
      onDelete: 'CASCADE',
    },
  ],
})
```

### Key Seed Configuration Options

| Property | Type | Description |
|---|---|---|
| `targetSeed` | `string` | **Required**. The slug of the target seed being referenced (e.g. `'authors'`). |
| `multiple` | `boolean` | When `false` (default), stores a single foreign key column (`content_<slug>.<branch>`). When `true`, automatically manages a many-to-many junction table (`rel_<slug>_<branch>`). |
| `onDelete` | `'SET NULL' \| 'RESTRICT' \| 'CASCADE'` | SQLite foreign key action on target deletion. Defaults to `'SET NULL'`. Setting `'RESTRICT'` activates the BeechCMS deletion guard. |
| `displayNameAlias` | `string` | **Required on Seed**. Specifies which field supplies the human-readable name (e.g. `'title'`) displayed in backref previews and dialogs. |

At engine boot, BeechCMS inspects all registered seeds and builds an in-memory `backrefMap` via `buildBackrefMap(seeds)`. Single relations map to direct foreign keys, while many-to-many relations (`multiple: true`) automatically create and query junction tables without manual mapping code.

---

## The Backrefs API

You can query all incoming relationships for any record using the protected `/backrefs` endpoint:

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
      "sourceLabel": "Articles",
      "branchAlias": "author",
      "branchLabel": "Author",
      "relationship": "single",
      "restricts": true,
      "total": 12,
      "items": [
        {
          "id": "art_01",
          "displayName": "Building Edge CMS with Cloudflare",
          "status": "published",
          "updated_at": 1709683200
        },
        {
          "id": "art_02",
          "displayName": "Understanding Botanical Seeds",
          "status": "published",
          "updated_at": 1709679600
        },
        {
          "id": "art_03",
          "displayName": "Direct-to-R2 Upload Architecture",
          "status": "published",
          "updated_at": 1709676000
        }
      ]
    },
    {
      "sourceSlug": "projects",
      "sourceLabel": "Projects",
      "branchAlias": "lead_contributor",
      "branchLabel": "Lead Contributor",
      "relationship": "single",
      "restricts": false,
      "total": 2,
      "items": [
        {
          "id": "proj_10",
          "displayName": "BeechCMS Core",
          "status": "published",
          "updated_at": 1709600000
        },
        {
          "id": "proj_20",
          "displayName": "Botanical UI Kit",
          "status": "published",
          "updated_at": 1709590000
        }
      ]
    }
  ]
}
```

### Field Reference

- **`sourceSlug`**: Slug of the seed containing the relation branch.
- **`sourceLabel`**: Display label of the source seed (from `seed.labelPlural` or `seed.label`).
- **`branchAlias`**: The alias of the relational branch.
- **`branchLabel`**: Human label of the relational branch (from `branch.label`).
- **`relationship`**: `'single'` for direct foreign key column, or `'multi'` for many-to-many junction tables.
- **`restricts`**: `true` when `branch.onDelete === 'RESTRICT'`, signaling that deleting this target record is restricted.
- **`total`**: Total number of inbound records in this group.
- **`items`**: Up to 3 preview records in default mode (`PREVIEW_LIMIT = 3`), ordered by `updated_at DESC`.
  - **`displayName`**: Entry title resolved via `sourceSeed.displayNameAlias`. Respects field privacy policies (returns `'••••••••'` if `visibility: 'masked'`, or `null` if `visibility: 'hidden'`).
  - **`status`**: Publication status (`'published'`, `'draft'`).
  - **`updated_at`**: Epoch timestamp in seconds.

### Deep Pagination

For high-volume relations, clients can paginate specific inbound edges:

```http
GET /api/content/authors/auth_123/backrefs?group=articles:author&page=2&limit=20
```

| Parameter | Type | Description |
|---|---|---|
| `group` | `string` | Group identifier in format `<sourceSlug>:<branchAlias>` (e.g. `articles:author`). |
| `page` | `number` | Page number (1-based, default: `1`). |
| `limit` | `number` | Number of items per page (default: `20`, maximum: `100`). |

When `group` is supplied, the endpoint queries only the requested relationship edge, returning the paginated subset in `items` along with the full `total` count.

---

## Dashboard Integration

In the BeechCMS React Dashboard, backrefs power two essential editorial experiences:

### 1. "Referenced By" Inspector
When editing any existing record in the Entry Editor, a collapsible card (`ReferencedByPanel`) is mounted under the form:
- **Grouped Overview**: Displays incoming references grouped by source seed and branch label.
- **Inline Preview**: Shows up to 3 preview entries per group with their title, publication badge, relative updated time, and a direct link to open the referenced entry.
- **Paginated Dialog**: Clicking **"Show all N"** opens a paginated dialog (`GroupDialog`) powered by `useBackrefsGroup` to navigate large relation sets.
- **Context-Aware Visibility**: The panel is hidden automatically during record creation (`isCreate`) and when no incoming references exist.

### 2. Deletion Guard & Orphan Prevention
Accidental deletions are prevented both in the UI and at the database layer:
- **UI Guard**: If any referencing group has `restricts: true` (`onDelete: 'RESTRICT'`) and `total > 0`, the Delete button in the form footer is **disabled** upfront with an informative tooltip (*"Cannot delete: X entries depend on this record"*).
- **Database Invariant**: Cloudflare D1 (SQLite) foreign key constraints enforce `ON DELETE RESTRICT`. Direct API delete attempts on restricted records are rejected with HTTP **`409 Conflict`**.
- **Safe Cascade**: If `onDelete: 'SET NULL'` (the default), deleting a record safely nulls the foreign key column or deletes the junction table row without blocking deletions.

---

## Frontend Querying with the Client SDK

The `/backrefs` endpoint is an authenticated administrative endpoint for the CMS Dashboard. Public frontends consume published content via `@beechcms/client`.

Because BeechCMS uses an edge-native relational data model (Cloudflare D1) rather than heavy nested ORM hydration, relations emit foreign key IDs. To query records by relationship or perform reverse lookups in frontend applications, query the referencing collection using `filter`:

```typescript
import { createBeechClient } from '@beechcms/client/server' // or @beechcms/client/browser

const client = createBeechClient({
  baseUrl: 'https://cms.example.com/api/v1/public',
  apiKey: 'beech_pub_...',
})

// 1. Fetch an author entry
const { data: author } = await client.content('authors').get({
  id: 'auth_123',
})

// 2. Query articles referencing this author (reverse lookup)
const { data: articles } = await client.content('articles').list({
  filter: {
    author: 'auth_123',
  },
  sort: {
    created_at: 'desc',
  },
  limit: 10,
})
```

For direct relation lookups (resolving a foreign key from article to author):

```typescript
// Fetch article by ID
const { data: article } = await client.content('articles').get({
  id: 'art_01',
})

// Resolve the related author using the foreign key
if (article?.data?.author) {
  const { data: author } = await client.content('authors').get({
    id: article.data.author,
  })
}
```
