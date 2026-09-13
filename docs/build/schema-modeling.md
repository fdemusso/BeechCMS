# Schema Modeling & Evolution

BeechCMS features a dynamic, database-backed schema engine termed the **Botanical Engine**. It translates high-level content blueprints directly into optimized SQLite tables, B-tree indexes, and FTS5 virtual tables inside Cloudflare D1.

This document is the complete reference for the `Seed` and `Branch` shapes — everything an AI agent connected via MCP (or a developer calling the REST API directly) needs to construct **any** content type the engine supports.

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
3. **AI Control Plane (`@beechcms/mcp`)**:
   Because schemas reside exclusively in D1 without local static files, AI assistants (Cursor, Claude Desktop, Antigravity) interact with the Botanical Engine using the official [MCP Server (`@beechcms/mcp`)](/reference/mcp-server) via an atomic Inspect → Validate → Plan → Apply cycle.

> [!TIP]
> Prefer to model in code and review schema changes in a pull request? Author a [`beech.schema.ts` manifest](/build/schema-manifest) with `defineSchema`/`defineField`, then reconcile it with `beech schema diff` → `plan` → `apply`. The manifest is desired state, reviewable in Git; D1 stays the runtime authority described above.

---

## Seed: Full Field Reference

A `Seed` is the top-level content type definition. Only `slug`, `label`, `displayNameAlias`, and `branches` are required — everything else defaults sensibly.

| Field | Type | Required | Default | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `slug` | `string` | ✅ | — | Table name is `content_{slug}`. Must match `^[a-z0-9_]+$`. Immutable after creation (renaming means creating a new seed). |
| `label` | `string` | ✅ | — | Singular UI label (e.g. `"Cliente"`). |
| `labelPlural` | `string` | — | `label` | Plural UI label (e.g. `"Clienti"`). |
| `displayNameAlias` | `string` | ✅ | — | Alias of the branch shown as the entry's human-readable name in lists/pickers. Must match `^[a-z][a-zA-Z0-9_]*$`, must not be a system column, must not be a SQL reserved keyword. **Should** point to an existing branch alias — if it doesn't, validation emits a non-fatal warning (`applicable` stays `true`), but the UI will show blank names until fixed. |
| `branches` | `Branch[]` | ✅ | `[]` | The field list — see [Branch: Full Field Reference](#branch-full-field-reference) below. |
| `allowPublicRead` | `boolean` | — | `false` | Enables `GET /api/v1/public/:seed`. |
| `allowPublicPost` | `boolean` | — | `false` | Enables `POST /api/v1/public/:seed/add`. |
| `allowPublicEdit` | `boolean` | — | `false` | Enables `PUT /api/v1/public/:seed/edit/:id`. |
| `allowDrafts` | `boolean` | — | `false` | Provisions a mirror `content_{slug}_drafts` table and enables `/draft` endpoints for pending-review workflows. |
| `softDelete` | `boolean` | — | `false` | Provisions the `deleted_at` system column and turns `DELETE` into a reversible move to the Trash. Enables the `/trash` endpoints and the dashboard Trash view. Must be a boolean when present. See [Trash, Soft Delete & GDPR Purge](/features/trash). |
| `retentionDays` | `number` | — | — | GDPR auto-cleanup/anonymization window. Must be a positive integer (`>= 1`) when set. With `softDelete: true` it drives the Trash retention countdown and `findExpiredByRetention`; **no scheduler deletes anything on a timer**. |
| `dashboard` | `DashboardSeedConfig` | — | — | UI-only config (icon, sidebar group/order, feature toggles, authorized views). Completely ignored by the Botanical Engine — safe to omit. See below. |
| `layout` | `unknown` | — | — | Custom editor form layout. Populated server-side; never set this from a candidate — it is engine-ignored and managed separately via the layout endpoints. |

### `dashboard` (optional, UI-only)

```jsonc
{
  "icon": "Users",          // Lucide icon name. Default: 'Folder'.
  "group": "CRM",           // Sidebar section label. Ungrouped seeds share "Contents".
  "order": 10,              // Sort order within the group, lower = higher. Default: 99.
  "hidden": false,          // Hide from sidebar nav. Default: false.
  "description": "Customer records",
  "features": { "search": true, "filter": true, "export": true, "bulkDelete": true },
  "views": ["table", "gallery", "kanban"]  // Content-manager views authorized for this seed. Default: ['table'].
}
```

---

## Branch: Full Field Reference

A `Branch` is a single typed field on a Seed. Only `id`, `alias`, `label`, and `type` are required.

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `id` | `string` | ✅ | Permanent logical handle, format `^br_[A-Za-z0-9]+$` (e.g. `br_01`, `br_title`). Never reuse an alias for this purpose — renaming an alias must never break FTS triggers, drafts, layouts, or automations, which all key off `id`. When calling `beech_schema_plan`/`apply` you may omit `id` on new branches — the server auto-assigns the next sequential `br_NN` (see `normalizeCandidate`), or preserves the existing stored id if the alias already exists. |
| `alias` | `string` | ✅ | SQL column name **and** JSON payload key. Must match `^[a-z][a-zA-Z0-9_]*$` (lowercase, alphanumeric + underscore). Cannot collide with a system column (`id`, `slug`, `status`, `created_at`, `updated_at`, `deleted_at`), an automation-grammar reserved word, or a SQL reserved keyword — all three are fatal validation errors. |
| `label` | `string` | ✅ | UI display label. |
| `type` | `BranchType` | ✅ | One of `text`, `number`, `boolean`, `date`, `file`, `relation`, `tags`, `repeater`, `richtext`, `json` — see the type table below. |
| `hint` | `string` | — | Tooltip help text in the entry form. UI-only. |
| `format` | `'plain' \| 'markdown' \| 'html' \| 'date' \| 'datetime' \| 'asset-list'` | — | Semantic variant. `date`/`datetime` apply to `date` branches; `asset-list` on a `multiple: true` `file` branch enables gallery management. |
| `multiple` | `boolean` | — | On `file`: single URL vs `string[]` of URLs. On `relation`: single FK column vs many-to-many junction table. |
| `options` | `string[]` | — | Static vocabulary for `text` (select dropdown) or `tags` branches. Not persisted as a DB constraint — advisory/UI only (and generates a TS union in generated types). |
| `requiredOnCreate` | `boolean` | — | Generates `NOT NULL` in the physical column. |
| `requiredOnUpdate` | `boolean` | — | Enforced at the API validation layer on update payloads. |
| `policies` | `object` | — | Access/handling policy — see [Policies & Data Classification](#policies--data-classification). All sub-fields optional, resolved with defaults via `resolvePolicies()`. |
| `numberOptions` | `NumberFieldOptions` | — | Only meaningful when `type: 'number'`. Ignored otherwise. |
| `fileOptions` | `FileFieldOptions` | — | Only meaningful when `type: 'file'`. Ignored otherwise. |
| `targetSeed` | `string` | required for `relation` | Slug of the referenced seed (no `content_` prefix). Must reference an existing active seed slug — unknown targets are a fatal validation error. |
| `onDelete` | `'CASCADE' \| 'SET NULL' \| 'RESTRICT'` | — | FK behavior. Default `'SET NULL'` for single relations, `'CASCADE'` for `multiple: true`. **`SET NULL` on a `multiple: true` relation is a fatal error** — junction rows have no nullable FK slot; use `CASCADE` or `RESTRICT`. |
| `fields` | `Branch[]` | required for `repeater` | Sub-schema for repeater items. Sub-branches are leaf/scalar only — `repeater`, `relation`, and `file` sub-types are fatally rejected. Same `id`/`alias` rules apply recursively. |
| `minItems` / `maxItems` | `number` | — | Repeater-only array length bounds (non-negative integers, `minItems <= maxItems`). Ignored (with a warning) on any other type. `minItems: 1, maxItems: 1, requiredOnCreate: true` models "exactly one required object". These do **not** by themselves make the field mandatory when absent — combine with `requiredOnCreate`. |

### Complete Branch Types Reference

| Type | Stored in D1 | Common Use Cases | Example Options & Constraints |
| :--- | :--- | :--- | :--- |
| `text` | `TEXT` | Titles, slugs, summaries, single-line text, emails, hashed secrets | `policies: { search: true, sort: true }`, `options: ['news', 'tech']` (select dropdown / TS union) |
| `number` | `REAL` | Prices, ratings, inventory, metrics | `numberOptions: { format: 'currency' \| 'decimal' \| 'percentage' \| 'compact', currency: 'EUR', min: 0, max: 100, step: 1, decimals: 2, grouping: true, control: 'input' \| 'slider' \| 'rating' \| 'stepper', prefix: '€', suffix: '/mo' }` |
| `boolean` | `INTEGER (0/1)` with CHECK constraint | Featured toggles, active statuses | `policies: { filter: true }` |
| `date` | `INTEGER (Unix timestamp in seconds)` | Event dates, deadlines, publication times (API accepts & returns ISO strings) | `format: 'date'` (YYYY-MM-DD) or `format: 'datetime'` (ISO 8601 string) |
| `file` | `TEXT (URL or JSON Array)` | Images, PDF documents, avatar photos | `fileOptions: { accept: 'image' \| 'document' \| 'any', maxSize: 5242880 }`, plus branch options `multiple: true`, `format: 'asset-list'` |
| `relation` | `TEXT (FK)` or Junction Table (`multiple: true`) | Author links, category references, many-to-many tags | `targetSeed: 'authors'`, `onDelete: 'SET NULL' \| 'CASCADE' \| 'RESTRICT'` (`SET NULL` disallowed on `multiple: true`; defaults to `'SET NULL'` on single, `'CASCADE'` on multi). Junction table is named `rel_{seed}_{alias}` — must stay under 256 chars and unique across the whole registry. |
| `tags` | `TEXT (JSON Array)` | Controlled tag arrays, category badges (up to 100 items) | `options: ['news', 'tech', 'design']` (UI suggestions & TS union types) |
| `repeater` | `TEXT (JSON Array)` | Structured repeatable blocks, feature lists | `fields: [...]` (leaf scalars only; nesting repeater, relation, or file is disallowed), `minItems: 1, maxItems: 5` |
| `richtext` | `TEXT (TipTap JSON Document)` | Long-form blog posts, articles, documentation | TipTap document format (HTML rendering is provided client-side by `@beechcms/client`) |
| `json` | `TEXT (JSON String)` | Metadata dictionaries, custom payload configurations | Raw JSON payload (validated, max depth 50) |

There is **no dedicated `password`/`secret` type**. Model sensitive scalars as `text` with `policies.classification: 'restricted'` or `'confidential'` — see below. Storing a secret as plain `text` with no policy leaves it in plaintext inside FTS5, B-tree indexes, and (if `allowPublicRead`/`allowPublicEdit` are on) public API responses, since `search`/`filter`/`sort`/`public` all **default to `true`**.

---

## Policies & Data Classification

**Every policy field defaults to permissive (`true`) unless the branch's resolved classification says otherwise.** You opt a field *out* of search/filter/sort/public exposure — you don't need to opt a normal field *in*.

```jsonc
"policies": {
  "classification": "public" | "internal" | "confidential" | "restricted",  // default: 'public'
  "privacy": "plain" | "hash" | "encrypt",   // alternate way to set classification; default: 'plain'
  "visibility": "full" | "masked" | "hidden", // override the resolved API visibility; default: derived from classification
  "search": true,    // include in FTS5 full-text search. default: true unless classification forces it off
  "filter": true,    // generate a B-tree index / dashboard filter column. default: true unless classification forces it off
  "sort": true,       // available as a dashboard sort column. default: true unless classification forces it off
  "public": true,     // included in Public API responses. default: true unless classification forces it off
  "publicEdit": false // updatable via public edit endpoints. default: true for public fields, false otherwise
}
```

### The 4-tier classification matrix

Setting `classification` (or the equivalent `privacy` value) resolves a whole bundle of defaults automatically — you do not need to set `search`/`filter`/`sort`/`public` yourself once you pick a tier:

| Classification | Storage at rest | Public API visibility | Authenticated API visibility | `search`/`filter`/`sort` default |
| :--- | :--- | :--- | :--- | :--- |
| `public` (default) | plain | full | full | all `true` |
| `internal` | plain | hidden | full | all `true` |
| `confidential` (or `privacy: 'encrypt'`) | AES-GCM encrypted | hidden | full | `search`/`sort` forced `false`; `filter` stays available **only via a blind index** (see below) |
| `restricted` (or `privacy: 'hash'`) | SHA-256 hashed | hidden | hidden | `search`, `filter`, `sort` all forced `false` |

Use:
- `restricted` for write-only secrets you only ever need to verify by equality (passwords, API keys) — the engine hashes on write and exposes no plaintext read path at all.
- `confidential` for values that must stay encrypted at rest but occasionally need exact-match filtering (e.g. a national ID number) — the engine transparently maintains a `{alias}_bidx` **blind index** column (a keyed hash used only for equality lookups) and an index on it, so you can filter without ever indexing or exposing the plaintext.
- `internal` for values that should never leave the Worker in an unauthenticated response but are otherwise ordinary (staff notes, internal SKUs).
- `public` (the default) for everything else.

`publicEdit` defaults to `true` only when the field is `public` (unless you set `public: false`); every other tier defaults `publicEdit` to `false`.

---

## Botanical Engine Compilation Pipeline

When a Seed is created or updated, the Botanical Engine compiles the abstract definition into concrete SQLite D1 operations, driven by the **resolved** policy values above (not the raw candidate JSON):

<p align="center">
  <img src="/images/botanical-engine-pipeline.svg" alt="Botanical Engine Compilation Pipeline" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

1. **Table Provisioning**: Creates the physical table `content_{slug}` with system columns (`id`, `slug`, `status`, `created_at`, `updated_at`). With `softDelete: true` the table additionally carries `deleted_at INTEGER` (nullable, no default — `NULL` means live), and the inline `slug ... UNIQUE` constraint is replaced by a *partial* unique index so a trashed entry releases its slug.
2. **Draft Mirror Staging**: When `allowDrafts: true`, provisions `content_{slug}_drafts` with identical column definitions to isolate unpublished drafts.
3. **Column Additions**: On schema updates, generates non-destructive `ALTER TABLE ... ADD COLUMN` statements for newly added branches.
4. **Index Generation**: `text`/`number`/`date`/`boolean` branches whose *resolved* `policies.filter` is `true` get a B-tree index (`idx_{slug}_{branch_alias}`). Single-value `relation` branches are always indexed regardless of `policies.filter` (the FK column needs it); `multiple: true` relations are skipped here — their junction table carries its own `idx_rel_{seed}_{alias}_parent` / `_target` indexes. `confidential` branches additionally get a blind-index column + index (`idx_{slug}_{branch_alias}_bidx`) unless `filter: false` is explicit. Every table also gets `idx_{slug}_status` and `idx_{slug}_created_at`. A `softDelete: true` seed also gets `idx_{slug}_deleted_at` and the partial unique index `idx_{slug}_slug_active ON content_{slug}(slug) WHERE deleted_at IS NULL`.
5. **Full-Text Search (FTS5)**: `text`/`richtext` branches whose *resolved* `policies.search` **and** `policies.public` are both `true` are added to the seed's `fts_{slug}` virtual table and its synchronizing triggers (`AFTER INSERT`, `AFTER UPDATE`, `AFTER DELETE`).

---

## The Additive Invariant

To guarantee that continuous deployment and automated migrations never result in accidental data loss:

> **The Additive Invariant**: Standard updates via `PUT /api/seeds/:slug` — and every mutation made through the MCP server — only accept **additive** mutations (adding new branches or updating non-destructive metadata).

If a payload attempts to rename an alias, drop a branch, or alter a field's physical type, the Botanical Engine immediately rejects the request with HTTP **`422 Unprocessable Entity`** (`PUT /api/seeds/:slug`) or a structured `blockedReasons` list naming the dedicated endpoint to use instead (MCP `beech_schema_plan`/`beech_schema_apply`). Existing columns are never dropped during standard/additive updates even if omitted from the branches payload.

---

## Danger Zone Operations

Destructive or breaking schema mutations require dedicated REST endpoints and explicit confirmation payloads. **None of these are reachable through the MCP server** — `beech_schema_apply` detects destructive intent (dropped branch, renamed alias, changed type) and refuses to apply, pointing the agent at the endpoint below instead. A human must perform these via the dashboard or a direct authenticated API call.

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

---

## AI-Driven Schema Evolution via MCP

Developers can also evolve schemas interactively using AI agents connected to the **[BeechCMS MCP Server (`@beechcms/mcp`)](/reference/mcp-server)**. The MCP server enforces the Additive Invariant end-to-end: agents can inspect definitions, validate candidate structures, and apply additive migrations, while any destructive intent is caught and blocked automatically. For complete setup instructions, see the **[AI & MCP Setup Guide](/start/mcp)**.

### Tool reference

| Tool | Purpose | Mutates D1? |
| :--- | :--- | :--- |
| `beech_list_seeds` | Lists every registered seed (summary: slug, label, status, branch count, `updatedAt`) plus the current `registry_version`. | No |
| `beech_get_seed` | Fetches the full definition for one slug. `404` if unknown. | No |
| `beech_schema_export` | Dumps the full registry snapshot (all definitions + layouts). Useful before a bulk edit. | No |
| `beech_schema_validate` | Validates a candidate `Seed` object in-memory against the full active seed set (relation targets, reserved aliases, id/alias formats, cardinality bounds). Returns `{ issues: [{ slug, messages, fatal }] }`. Zero-latency — no D1 round trip. | No |
| `beech_schema_plan` | Server-computes the exact DDL and safety `classification` (`'create'` \| `'additive'` \| `'destructive'`) for a candidate. Returns `statements`, `blockedReasons`, `ftsRebuildNeeded`, and `expectedVersion` (current `registry_version`, for optimistic concurrency). Stores the plan server-side for **10 minutes, single-use**. **Always call this before `beech_schema_apply`.** | No (dry-run) |
| `beech_schema_apply` | Consumes a `planId` from `beech_schema_plan` and atomically executes it: re-validates, re-classifies, then runs a single CAS-guarded `db.batch()` (version guard + DDL + seed upsert + version bump). Rejects with a conflict if `registry_version` drifted since the plan was computed (re-run `beech_schema_plan`), or if the plan was classified `'destructive'` (use the dedicated endpoint named in the plan's `blockedReasons` instead). | **Yes** |

### Recommended workflow

1. `beech_schema_validate` — iterate on the candidate JSON until `issues` has no `fatal: true` entries.
2. `beech_schema_plan` — inspect `statements` and `classification`. If `classification !== 'create' | 'additive'` or `blockedReasons` is non-empty, stop — that change needs a human via the Danger Zone endpoints above.
3. `beech_schema_apply` with the returned `planId` — do this promptly, the plan expires after 10 minutes and is invalidated by any other concurrent schema write.
4. `beech_get_seed` — confirm the stored definition matches intent.

### Worked example — a seed exercising every branch type

```jsonc
{
  "slug": "clienti",
  "label": "Cliente",
  "labelPlural": "Clienti",
  "displayNameAlias": "email",
  "allowDrafts": true,
  "branches": [
    { "id": "br_01", "alias": "nome",     "label": "Nome",     "type": "text", "requiredOnCreate": true },
    { "id": "br_02", "alias": "cognome",  "label": "Cognome",  "type": "text", "requiredOnCreate": true },
    { "id": "br_03", "alias": "email",    "label": "Email",    "type": "text" },

    // Secret: hashed at rest, no search/filter/sort/public exposure.
    { "id": "br_04", "alias": "password", "label": "Password", "type": "text",
      "policies": { "classification": "restricted" } },

    // Encrypted but still filterable by exact match via the blind index.
    { "id": "br_05", "alias": "codice_fiscale", "label": "Codice Fiscale", "type": "text",
      "policies": { "classification": "confidential" } },

    { "id": "br_06", "alias": "eta", "label": "Età", "type": "number",
      "numberOptions": { "format": "decimal", "min": 0, "max": 120, "step": 1 } },

    { "id": "br_07", "alias": "attivo", "label": "Attivo", "type": "boolean" },

    { "id": "br_08", "alias": "iscritto_il", "label": "Iscritto il", "type": "date", "format": "date" },

    { "id": "br_09", "alias": "avatar", "label": "Avatar", "type": "file",
      "fileOptions": { "accept": "image", "maxSize": 2097152 } },

    { "id": "br_10", "alias": "segmenti", "label": "Segmenti", "type": "tags",
      "options": ["vip", "prospect", "churned"] },

    { "id": "br_11", "alias": "azienda", "label": "Azienda", "type": "relation",
      "targetSeed": "aziende", "onDelete": "SET NULL" },

    { "id": "br_12", "alias": "tag_gruppi", "label": "Gruppi", "type": "relation",
      "targetSeed": "gruppi", "multiple": true, "onDelete": "CASCADE" },

    { "id": "br_13", "alias": "indirizzi", "label": "Indirizzi", "type": "repeater",
      "minItems": 0, "maxItems": 5,
      "fields": [
        { "id": "br_13a", "alias": "via",  "label": "Via",  "type": "text" },
        { "id": "br_13b", "alias": "citta", "label": "Città", "type": "text" },
        { "id": "br_13c", "alias": "cap",   "label": "CAP",   "type": "text" }
      ]
    },

    { "id": "br_14", "alias": "note", "label": "Note", "type": "richtext" },
    { "id": "br_15", "alias": "metadata", "label": "Metadata", "type": "json" }
  ]
}
```

This single definition exercises: required scalars, a hashed secret, an encrypted-but-filterable field, formatted numbers, booleans, dates, files, tags, a single-value relation, a many-to-many relation, a bounded repeater, richtext, and raw JSON — i.e. every primitive the MCP `beech_schema_plan`/`beech_schema_apply` cycle can provision in one additive `create` call. (`aziende` and `gruppi` must already exist as active seeds, or `beech_schema_validate` will fatally reject the unknown `targetSeed` references.)
