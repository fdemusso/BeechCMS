# Architecture — Beech CMS

This document describes the structural reasoning behind the Beech CMS monorepo: how packages relate, why specific storage and compute choices were made, and how the system is actively migrating from a layered architecture toward **Vertical Slice Architecture (VSA)**.

Every design decision documented here is grounded in the source code and explicitly chosen — not inherited by default.

---

## Table of Contents

1. [Monorepo Topology](#1-monorepo-topology)
2. [Turborepo Build Strategy](#2-turborepo-build-strategy)
3. [`@beechcms/core` — The Single Source of Truth](#3-beechcore--the-single-source-of-truth)
4. [The Botanical Engine — Schema Compiler](#4-the-botanical-engine)
5. [The Per-Type SQL Model](#5-the-per-type-sql-model)
6. [Cloudflare D1 — SQLite at the Edge](#6-cloudflare-d1--sqlite-at-the-edge)
7. [Vertical Slice Architecture — Current State & Migration Path](#7-vertical-slice-architecture--current-state--migration-path)
8. [Dependency Rules](#8-dependency-rules)
9. [Pending Draft Workflow — Mirror Tables](#9-pending-draft-workflow)

---

## 1. Monorepo Topology

The monorepo uses **npm workspaces** at the root. `apps/api` and `apps/dashboard` both declare `"@beechcms/core": "*"` (workspace protocol) in their `package.json` dependencies.

```text
@beechcms/cms/
├── apps/
│   ├── api/          # Hono REST API — Cloudflare Workers
│   └── dashboard/    # React + Vite SPA
├── packages/
│   └── core/         # @beechcms/core — shared engine, types, validation
├── docs/
├── turbo.json
└── package.json      # Root: npm workspaces ["apps/*", "packages/*"]

```

### Dependency Layers

| Layer | Package | Allowed Imports |
|---|---|---|
| **Apps** | `apps/api`, `apps/dashboard` | `@beechcms/core`, npm, local src |
| **Core** | `packages/core` | npm only (no app imports) |
| **Shared** | `src/components/ui`, `src/lib` | npm, `@beechcms/core` — _never_ `features/*` |

---

## 2. Turborepo Build Strategy

`turbo.json` defines a DAG-based pipeline. Turborepo resolves the workspace dependency graph and executes tasks in topological order:

-   **@beechcms/core (build)** → **apps/api (build)**

-   **@beechcms/core (build)** → **apps/dashboard (build)**


This means `packages/core` is **always compiled first**. The apps consume the compiled output at `packages/core/dist/index.js`.

```bash
# Development Mode
npm run dev

# 1. packages/core: tsc -w (rebuilds dist/ on change)
# 2. apps/api: wrangler dev (reads dist/ via @beechcms/core)
# 3. apps/dashboard: vite dev (reads dist/ via @beechcms/core)
```

**Why this matters:** Any type mismatch in the core results in a **compile-time error** across all apps simultaneously, preventing runtime drift.

---

## 3. `@beechcms/core` — The Single Source of Truth

No business logic touching schema, validation, or translation exists in the apps. They are pure consumers of `@beechcms/core`.

```typescript
// packages/core/src/index.ts
export * from './types';           // Seed, Branch, DbPayload, ApiPayload
export * from './seeds';           // SEED_REGISTRY, getSeed
export * from './engine';          // generateCreateTable, buildSelectQuery, etc.
export * from './validation';      // validateAndSanitizeSeedPayload
export * from './richtext';        // TipTap Envelopes
export * from './richtext-render'; // TipTap → HTML
export * from './slug-utils';      // slugify logic
```

### Branch Policies — `resolvePolicies`

Every `Branch` in a seed can declare an optional `policies` object that controls how the field is stored, exposed, and surfaced in the UI:

| Policy | Type | Default | Effect |
|---|---|---|---|
| `privacy` | `'plain' \| 'hash' \| 'encrypt'` | `'plain'` | `hash` → value is SHA-256 hex-digested server-side before writing; `encrypt` → 501 placeholder |
| `visibility` | `'full' \| 'masked' \| 'hidden'` | `'full'` (or `'hidden'` when `privacy !== 'plain'`) | `masked` → returns `'••••••••'` on read; `hidden` → field is stripped from responses |
| `search` | `boolean` | `true` | When `false`, the column is excluded from full-text search queries |
| `filter` | `boolean` | `true` | When `false`, the column is not offered in the dashboard filter UI |
| `sort` | `boolean` | `true` | When `false`, the column is not offered in the dashboard sort UI |
| `public` | `boolean` | `true` | When `false`, the field is stripped from Public API responses |

**`privacy` and `visibility` are coupled by design.** When `privacy` is `hash` or `encrypt`, `resolvePolicies` automatically defaults `visibility` to `'hidden'`, so the stored digest is never returned to callers. This default can be explicitly overridden in the seed definition if needed.

**`privacy: 'hash'` write flow:**
```
client sends plaintext  →  API validates (Zod)  →  sha256hex()  →  Botanic Engine serializes  →  DB stores hash in real column
```
The plaintext never persists. Sensitive fields cannot be updated via PUT — the handler returns `422` if any non-plain field appears in the patch.

**Comparing a hashed field** (e.g. password verification): use `verifyHashField` from `@beechcms/core` inside a dedicated server-side handler. Never expose the hash to the client.

```typescript
import { verifyHashField } from '@beechcms/core'

const match = await verifyHashField(storedHash, candidatePlaintext)
```

All policy resolution **must** go through `resolvePolicies(branch)` from `@beechcms/core`. Never inline-check `branch.policies?.x ?? default`.

```typescript
import { resolvePolicies } from '@beechcms/core'

const { privacy, visibility, search, filter, sort, public: isPublic } = resolvePolicies(branch)
```

Existing branches without a `policies` field behave exactly as before — all defaults are permissive.

---

### The `Seed` Interface — Required Fields

Every seed definition (`packages/core/src/seeds.ts`) must include a `displayNameAlias` field:

```typescript
export interface Seed {
  slug: string           // URL identifier (e.g. "articoli")
  label: string          // Singular UI label (e.g. "Articolo")
  labelPlural?: string   // Plural UI label
  displayNameAlias: string // REQUIRED — alias of the branch used as human-readable name
  // ...
  branches: Branch[]
}
```

**`displayNameAlias` is mandatory.** It points to the alias of the branch that serves as the human-readable identifier for a content entry (e.g., `"title"` for articles, `"name"` for products, `"author"` for testimonials). Without it, UI components cannot reliably display a meaningful label for an entry without hard-coding field names:

| Seed | `displayNameAlias` | Branch label |
|---|---|---|
| `articoli` | `title` | Titolo |
| `prodotti` | `name` | Nome |
| `team` | `name` | Nome |
| `testimonianze` | `author` | Autore |
| `pagine` | `title` | Titolo |
| `messaggi` | `name` | Nome mittente |

UI consumers (`QuickDraftWidget`, gallery title resolution, content lists) read `displayNameAlias` from the seed instead of relying on heuristics or hard-coded aliases.

---

## 4. The Botanical Engine — Schema Compiler

In v0.4.0, the Botanical Engine evolves from a runtime translator to a **Schema Compiler**. It reads the TypeScript Seed definitions and generates deterministic SQL DDL and queries.

### Responsibilities

1. **DDL Generation**: `generateCreateTable(seed)` produces the SQL to create `content_{slug}` tables.
2. **Migration Generation**: `generateAddColumn(seed, branch)` handles schema evolution.
3. **Query Building**: `buildSelectQuery(seed, options)` constructs optimized SQL queries using real column names.
4. **Serialization**: `serializeForDb` and `deserializeFromDb` handle type conversion (e.g., booleans to 0/1, JSON objects to strings).

### Removal of Internal IDs

Internal IDs like `br01` are eliminated. The `alias` defined in the Seed is now used directly as the SQL column name. This simplifies the engine and improves database readability.

---

## 5. The Per-Type SQL Model

Beech CMS uses a dedicated table for each content type. This ensures maximum performance, native SQL constraints, and reliable mathematical operations.

### SQL Schema (Example: `articoli`)

```sql
CREATE TABLE content_articoli (
  id          TEXT    NOT NULL PRIMARY KEY, -- UUID v4
  slug        TEXT    NOT NULL UNIQUE,      -- URL identifier
  status      TEXT    NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'published', 'archived')),
  title       TEXT,                         -- Real column from alias
  body        TEXT,                         -- Real column from alias
  price       REAL,                         -- Correct SQLite type
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### Design Decisions

- **Per-Type Tables**: Every Seed generates a `content_{seed.slug}` table.
- **Native Types**: `number` branches become `REAL`, `boolean` become `INTEGER` (0/1), etc.
- **No JSON Blobs**: Content data is stored in real columns, enabling B-tree indexing and native SQL filters.
- **Automatic Indexing**: The engine automatically generates indexes for `status`, `created_at`, and any branch marked for filtering.


---

## 6. Cloudflare D1 — SQLite at the Edge

Beech leverages D1 to co-locate read replicas with Worker execution nodes, eliminating regional latency.

| Option | Latency | Note |
|---|---|---|
| **External Postgres** | 20–100ms | Egress overhead |
| **Cloudflare D1** | **<1ms** | Co-located with Worker |

---

## 7. Vertical Slice Architecture (VSA)

We are migrating from a Layered Architecture (folders by technical type) to a **Feature-Based** structure.

### Target Structure (`apps/dashboard/src/`)
```
features/
├── content-management/
│   ├── index.ts        # Public API (Barrel)
│   ├── components/     # Feature-scoped UI
│   ├── hooks/          # useContentList, etc.
│   └── api/            # content.api.ts
├── richtext-editor/
│   ├── index.ts
│   └── extensions/     # TipTap config
└── dashboard/          # Stats & Widgets

```

### The `index.ts` Contract

Every feature **must** expose a public API. Direct imports of internal feature files from outside the slice are forbidden.

### VSA Dependency Flow

[![VSA Dependency Flow](https://mermaid.ink/img/pako:eNp9ksFSwjAQhl-ls1dbIAFa7MGLDCedYcSTrYfQLG3GNumkiYIM726gBYrjmFP-_Lv5djfZQ6Y4QgybUn1lBdPGe52n0nOrsetcs7rwXpQ1QuZPbIfaS2qWYzN8b2OOa0mSTEmD0gSlaEzfoReHo2Gi7DyUPJW_IAtkxmpsOsqmk33Q4gqqmHRlVG7b92miRVYY3JoAuTBK_8NbuV6Rd7RMVbWS7rZm6N15pVj3sSuSWBHUWlTCiE9s-hZNWC2CrBTXSnqwJfGC4MHV3Un6p6Tn8EUbviK3kt7INWJWDDOlEXzIteAQG23Rhwp1xY4S9seEFEzhBpRC7Lac6Y8UUnlwOTWTb0pV5zStbF5AvGFl45StOTM4F8wNqbqcatcT6kdlpYF4TCanSyDewxZiQieD6TQaEzKLolkYjZy7g5gSMphFk3tK6DgKR2EYHnz4PnFHzpj60L7Qc_v7Tp_w8AMRPcXf?type=png)](https://mermaid.live/edit#pako:eNp9ksFSwjAQhl-ls1dbIAFa7MGLDCedYcSTrYfQLG3GNumkiYIM726gBYrjmFP-_Lv5djfZQ6Y4QgybUn1lBdPGe52n0nOrsetcs7rwXpQ1QuZPbIfaS2qWYzN8b2OOa0mSTEmD0gSlaEzfoReHo2Gi7DyUPJW_IAtkxmpsOsqmk33Q4gqqmHRlVG7b92miRVYY3JoAuTBK_8NbuV6Rd7RMVbWS7rZm6N15pVj3sSuSWBHUWlTCiE9s-hZNWC2CrBTXSnqwJfGC4MHV3Un6p6Tn8EUbviK3kt7INWJWDDOlEXzIteAQG23Rhwp1xY4S9seEFEzhBpRC7Lac6Y8UUnlwOTWTb0pV5zStbF5AvGFl45StOTM4F8wNqbqcatcT6kdlpYF4TCanSyDewxZiQieD6TQaEzKLolkYjZy7g5gSMphFk3tK6DgKR2EYHnz4PnFHzpj60L7Qc_v7Tp_w8AMRPcXf)

---

## 8. Dependency Rules

1.  **Feature Isolation**: Features **never** import from other features.

2.  **Shared Promotion**: If two features need the same logic, it is promoted to the `shared` layer or `@beechcms/core`.

3.  **Encapsulation**: Pages only interact with the `index.ts` of a feature.


### ESLint Enforcement

```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["../features/*", "../../features/*"],
        "message": "Do not import directly from another feature. Use the barrel index."
      }]
    }]
  }
}

```

---

---

## 9. Pending Draft Workflow — Mirror Tables

### Overview

The pending draft system allows editorial content types to maintain a **separate draft** on top of a live (published) entry. v0.4.0 uses a mirror table strategy instead of a JSON column.

This feature is opt-in per seed via the `allowDrafts` flag in `@beechcms/core`:

```typescript
// packages/core/src/seeds.ts
export const ARTICOLO_SEED: Seed = {
  slug: 'articoli',
  allowDrafts: true,  // ← enables draft tables for this type
  // ...
}
```

### Storage

A separate table `content_{slug}_drafts` is created for each Seed with `allowDrafts: true`. It contains the same columns as the main table (mapped from branches) plus an `entry_id` foreign key.

```sql
CREATE TABLE content_articoli_drafts (
  entry_id    TEXT NOT NULL PRIMARY KEY REFERENCES content_articoli(id) ON DELETE CASCADE,
  title       TEXT,
  body        TEXT,
  ...
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### API Surface

All draft endpoints are JWT-protected (internal API only).

| Method | Path | Description |
|---|---|---|
| `PUT` | `/api/content/:slug/:id/draft` | Writes to the `content_{slug}_drafts` table. Relaxed validation. |
| `GET` | `/api/content/:slug/:id/draft` | Reads from the mirror table. |
| `POST` | `/api/content/:slug/:id/draft/publish` | Atomic promotion: `INSERT INTO content_{slug} ... SELECT ... FROM content_{slug}_drafts`. |
| `DELETE` | `/api/content/:slug/:id/draft` | Discards the draft row. |

### Data Flow

```
Editor saves changes
       │
       ▼
PUT /:slug/:id/draft
  validateAndSanitizeSeedPayload (operation=update, enforceRequired=false)
  INSERT INTO content_{slug}_drafts (SQL columns)
       │
       ▼ (review / approval)
POST /:slug/:id/draft/publish
  INSERT INTO content_{slug} (...) SELECT ... FROM content_{slug}_drafts  ← atomic
       │
       ▼
Live content updated, draft row deleted
```

### Invariants

- **`content_{slug}` is never modified by draft endpoints.** Only `POST /draft/publish` performs the write.
- **Botanical Engine generates optimized DDL and DML for both tables.**
- **Sensitive fields (`privacy: 'hash'`) are blocked from drafts.**
- **`hasPendingDraft` in GET responses** is computed server-side via `EXISTS` check on the mirror table.

---

---

## 10. Performance Layer

### FTS5 — SQL Triggers

In v0.4.0, full-text search is managed entirely within the database using SQLite's FTS5 engine and triggers. This replaces the complex application-layer synchronization used in previous versions.

### Sincronizzazione automatica

Il Botanical Engine genera i trigger SQL necessari per mantenere la tabella virtuale `fts_{slug}` sincronizzata:

```sql
CREATE TRIGGER fts_articoli_insert AFTER INSERT ON content_articoli BEGIN
  INSERT INTO fts_articoli(entry_id, body) VALUES (new.id, new.body);
END;
```

**Limitazione:** Solo il campo `body` (di tipo `richtext`) viene indicizzato nella FTS5. Altri campi usano indici B-tree standard sulle colonne reali.

### Indici su colonne reali

Le query di filtraggio e ordinamento sono ora estremamente veloci perché operano su colonne SQL reali con indici dedicati:

```sql
CREATE INDEX idx_content_articoli_status ON content_articoli(status);
CREATE INDEX idx_content_articoli_created_at ON content_articoli(created_at DESC);
CREATE INDEX idx_content_articoli_title ON content_articoli(title);
```

### Media Library — Tabella `media_objects` (migration `0021`)

Ogni file caricato su R2 viene ora tracciato in `media_objects (key, filename, mime_type, size_bytes, uploaded_by, created_at)`. Le operazioni di INSERT/DELETE avvengono in `upload.ts` tramite `waitUntil` (asincrono, non bloccante). Questa tabella abilita:
- Media library UI (lista file con owner e dimensione)
- Rilevamento orfani (file non referenziati in alcuna entry)
- Utilizzo storage per utente (`WHERE uploaded_by = ?`)
- Fonte canonica per il totale storage: `SELECT SUM(size_bytes) FROM media_objects`

### Analytics per Seed (migration `0022`)

La tabella `analytics` è stata ricreata con una colonna `seed TEXT NOT NULL DEFAULT ''`. La stringa vuota è il sentinel per le metriche globali (usare NULL avrebbe rotto l'upsert `ON CONFLICT` per le proprietà di unicità di SQLite sui NULL).

Il middleware in `index.ts` estrae il seed dalla URL (`/api/v1/public/:seed`) e lo registra nella colonna. Le query dei widget globali filtrano con `AND seed = ''`.

### Worker Cache API per Public Reads

Le GET su `/api/v1/public/:seed` sono ora messe in cache via `caches.default` con TTL 60 secondi. Il pattern:

```typescript
// Check cache prima di toccare D1
const hit = await caches.default.match(c.req.raw)
if (hit) return hit

// ... esegui query D1 ...

// Cache asincrona via waitUntil
c.executionCtx.waitUntil(
  caches.default.put(cacheKey, cachedResponse)
)
```

Solo le risposte 200 vengono messe in cache. Errori (404, 403, 500) non sono mai cachati. Cache key = URL completo inclusi query params — query diverse producono entry separate.

---

_Beech CMS Architecture Guide — Built for Scale at the Edge._