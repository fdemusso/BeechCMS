# Schema Modeling & Evolution

BeechCMS features a dynamic, database-backed schema engine termed the **Botanical Engine**. It translates high-level content blueprints directly into optimized SQLite tables, B-tree indexes, and FTS5 virtual tables inside Cloudflare D1.

---

## Core Concepts

Schema modeling in BeechCMS revolves around three primitives:

- **Seeds (Blueprints)**: Top-level content models (e.g., `posts`, `authors`, `products`). Each Seed defines an identifying `slug`, UI labels, branches, permissions, and layout rules.
- **Branches (Fields)**: Typed properties inside a Seed (e.g., `title`, `cover_image`, `body`, `tags`). Every branch is assigned a permanent identifier (`id: 'br_...'`, sequentially assigned as `br_01`, `br_02`, etc.) that preserves database integrity and relationships regardless of alias renaming.
- **Fruits (Records)**: Instantiated content items persisted in Cloudflare D1 (represented as `Entry` / `Record<string, unknown>`).

```text
Seed (Blueprint)  ──►  Branches (Fields)  ──►  Fruits (Records)
```

<p align="center">
  <img src="/images/content-structure-seed-entries.svg" alt="Seed Blueprint and Branch Structure" style="width: 100%; max-width: 820px; margin: 16px 0;" />
</p>

---

## Canonical D1 Database Authority

Unlike traditional headless CMSs that require code-level schema declarations or server-restart migrations, BeechCMS treats Cloudflare D1 as the **single source of truth**:

1. **System Schema Table (`seeds`)**:
   All Seed definitions are stored as structured JSON records inside the `seeds` system table in D1.
2. **Multi-Isolate Cache Invalidation (`seed_meta`)**:
   Because Cloudflare Workers execute across hundreds of worldwide edge isolates, local in-memory schema caches could become stale. BeechCMS maintains a `registry_version` counter in the `seed_meta` table. Every schema mutation increments `registry_version`, instructing edge worker isolates to atomically invalidate their cached schemas on the next request.

---

## Complete Branch Types Reference

BeechCMS supports 10 specialized Branch types:

| Type | Stored in D1 | Common Use Cases | Example Options & Constraints |
| :--- | :--- | :--- | :--- |
| `text` | `TEXT` | Titles, slugs, summaries, single-line text | `policies: { search: true, sort: true }`, `options: ['news', 'tech']` (select dropdown / TS union) |
| `number` | `REAL` | Prices, ratings, inventory, metrics | `numberOptions: { format: 'currency' \| 'decimal' \| 'percentage' \| 'compact', currency: 'EUR', min: 0, max: 100, step: 1, decimals: 2, grouping: true, control: 'input' \| 'slider' \| 'rating' \| 'stepper', prefix: '€', suffix: '/mo' }` |
| `boolean` | `INTEGER (0/1)` with CHECK constraint | Featured toggles, active statuses | `policies: { filter: true }` |
| `date` | `INTEGER (Unix timestamp in seconds)` | Event dates, deadlines, publication times (API accepts & returns ISO strings) | `format: 'date'` (YYYY-MM-DD) or `format: 'datetime'` (ISO 8601 string) |
| `file` | `TEXT (URL or JSON Array)` | Images, PDF documents, avatar photos | `fileOptions: { accept: 'image' \| 'document' \| 'any', maxSize: 5242880 }`, plus branch options `multiple: true`, `format: 'asset-list'` |
| `relation` | `TEXT (FK)` or Junction Table (`multiple: true`) | Author links, category references, many-to-many tags | `targetSeed: 'authors'`, `onDelete: 'SET NULL' \| 'CASCADE' \| 'RESTRICT'` (`SET NULL` disallowed on `multiple: true`; defaults to `'SET NULL'` on single, `'CASCADE'` on multi) |
| `tags` | `TEXT (JSON Array)` | Controlled tag arrays, category badges (up to 100 items) | `options: ['news', 'tech', 'design']` (UI suggestions & TS union types) |
| `repeater` | `TEXT (JSON Array)` | Structured repeatable blocks, feature lists | `fields: [...]` (leaf scalars only; nesting repeater, relation, or file is disallowed), `minItems: 1, maxItems: 5` |
| `richtext` | `TEXT (TipTap JSON Document)` | Long-form blog posts, articles, documentation | TipTap document format (HTML rendering is provided client-side by `@beechcms/client`) |
| `json` | `TEXT (JSON String)` | Metadata dictionaries, custom payload configurations | Raw JSON payload (validated, max depth 50) |

---

## Botanical Engine Compilation Pipeline

When a Seed is created or updated, the Botanical Engine compiles the abstract definition into concrete SQLite D1 operations:

<p align="center">
  <img src="/images/botanical-engine-pipeline.svg" alt="Botanical Engine Compilation Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

1. **Table Provisioning**: Creates the physical table `content_{slug}` with system columns (`id`, `slug`, `status`, `created_at`, `updated_at`).
2. **Draft Mirror Staging**: When `allowDrafts: true`, provisions `content_{slug}_drafts` with identical column definitions to isolate unpublished drafts.
3. **Column Additions**: On schema updates, generates non-destructive `ALTER TABLE ... ADD COLUMN` statements for newly added branches.
4. **Index Generation**: Branches with `policies: { filter: true }` or `sort: true` automatically produce B-tree indexes (`idx_{slug}_{branch_alias}`).
5. **Full-Text Search (FTS5)**: Branches with `policies: { search: true }` generate an SQLite `fts_{slug}` virtual table and synchronizing triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE`).

---

## The Additive Invariant

To guarantee that continuous deployment and automated migrations never result in accidental data loss:

> **The Additive Invariant**: Standard updates via `PUT /api/seeds/:slug` only accept **additive** mutations (adding new branches or updating non-destructive metadata).

If a payload sent to `PUT /api/seeds/:slug` attempts to rename an alias or alter a field's physical type, the Botanical Engine immediately rejects the request with HTTP **`422 Unprocessable Entity`**. Existing columns are never dropped during standard updates even if omitted from the branches payload.

---

## Danger Zone Operations

Destructive or breaking schema mutations require dedicated endpoints and explicit confirmation payloads:

### 1. Seed Deletion
- **Soft Deletion (`DELETE /api/seeds/:slug`)**: Marks the seed as deleted in D1 without dropping physical tables, preserving historic data.
- **Hard Deletion (`DELETE /api/seeds/:slug/hard`)**: Permanently drops the physical `content_{slug}` table, staging table, FTS5 indexes, and purges all associated R2 media assets.
- **Back-Reference Safety Check (`backrefMap`)**: Both deletion endpoints verify if other Seeds reference the target seed via `relation` branches. If references exist, the API returns **`409 Conflict`**.
- **Confirmation Payload**: Hard deletion requires explicit confirmation:
  ```json
  {
    "confirm": "<slug>"
  }
  ```

### 2. Branch Alias Renaming
To rename a branch alias without dropping data:
- Endpoint: `PATCH /api/seeds/:slug/branches/:branchId/rename`
- Confirmation Payload:
  ```json
  {
    "newAlias": "headline",
    "confirm": "<slug>.<oldAlias>"
  }
  ```
Because physical storage maps to permanent branch IDs (`br_XX`), the engine executes `ALTER TABLE ... RENAME COLUMN` and triggers a full FTS index rebuild via `planFtsRebuild`.

### 3. Branch Retyping
- Endpoint: `PATCH /api/seeds/:slug/branches/:branchId/retype`
- Confirmation Payload:
  ```json
  {
    "newType": "<targetType>",
    "confirm": "<slug>.<alias>"
  }
  ```
*(Note: Retyping to or from `'repeater'` is strictly disallowed and returns `422` due to incompatible nested JSON structures).*

### 4. Dropping a Branch
- Endpoint: `DELETE /api/seeds/:slug/branches/:branchId`
- Confirmation Payload:
  ```json
  {
    "confirm": "<slug>.<alias>"
  }
  ```
Permanently removes the branch metadata and drops the corresponding column from physical tables.
