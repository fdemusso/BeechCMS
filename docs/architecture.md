# Architecture — Beech CMS

This document describes the structural reasoning behind the Beech CMS monorepo: how packages relate, why specific storage and compute choices were made, and how the system is actively migrating from a layered architecture toward **Vertical Slice Architecture (VSA)**.

Every design decision documented here is grounded in the source code and explicitly chosen — not inherited by default.

---

## Table of Contents

1. [Monorepo Topology](#1-monorepo-topology)
2. [Turborepo Build Strategy](#2-turborepo-build-strategy)
3. [`@beech/core` — The Single Source of Truth](#3-beechcore--the-single-source-of-truth)
4. [The Botanical Engine](#4-the-botanical-engine)
5. [The Atomic Data Model](#5-the-atomic-data-model)
6. [Cloudflare D1 — SQLite at the Edge](#6-cloudflare-d1--sqlite-at-the-edge)
7. [Vertical Slice Architecture — Current State & Migration Path](#7-vertical-slice-architecture--current-state--migration-path)
8. [Dependency Rules](#8-dependency-rules)
9. [Pending Draft Workflow](#9-pending-draft-workflow)

---

## 1. Monorepo Topology

The monorepo uses **npm workspaces** at the root. `apps/api` and `apps/dashboard` both declare `"@beech/core": "*"` (workspace protocol) in their `package.json` dependencies.

```text
beech-cms/
├── apps/
│   ├── api/          # Hono REST API — Cloudflare Workers
│   └── dashboard/    # React + Vite SPA
├── packages/
│   └── core/         # @beech/core — shared engine, types, validation
├── docs/
├── turbo.json
└── package.json      # Root: npm workspaces ["apps/*", "packages/*"]

```

### Dependency Layers

| Layer | Package | Allowed Imports |
|---|---|---|
| **Apps** | `apps/api`, `apps/dashboard` | `@beech/core`, npm, local src |
| **Core** | `packages/core` | npm only (no app imports) |
| **Shared** | `src/components/ui`, `src/lib` | npm, `@beech/core` — _never_ `features/*` |

---

## 2. Turborepo Build Strategy

`turbo.json` defines a DAG-based pipeline. Turborepo resolves the workspace dependency graph and executes tasks in topological order:

-   **@beech/core (build)** → **apps/api (build)**

-   **@beech/core (build)** → **apps/dashboard (build)**


This means `packages/core` is **always compiled first**. The apps consume the compiled output at `packages/core/dist/index.js`.

```bash
# Development Mode
npm run dev

# 1. packages/core: tsc -w (rebuilds dist/ on change)
# 2. apps/api: wrangler dev (reads dist/ via @beech/core)
# 3. apps/dashboard: vite dev (reads dist/ via @beech/core)
```

**Why this matters:** Any type mismatch in the core results in a **compile-time error** across all apps simultaneously, preventing runtime drift.

---

## 3. `@beech/core` — The Single Source of Truth

No business logic touching schema, validation, or translation exists in the apps. They are pure consumers of `@beech/core`.

```typescript
// packages/core/src/index.ts
export * from './types';           // Seed, Branch, DbPayload, ApiPayload
export * from './seeds';           // SEED_REGISTRY, getSeed
export * from './engine';          // apiToDb, dbToApi
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
client sends plaintext  →  API validates (Zod)  →  sha256hex()  →  apiToDb()  →  DB stores hash
```
The plaintext never persists. Sensitive fields cannot be updated via PUT — the handler returns `422` if any non-plain field appears in the patch.

**Comparing a hashed field** (e.g. password verification): use `verifyHashField` from `@beech/core` inside a dedicated server-side handler. Never expose the hash to the client.

```typescript
import { verifyHashField } from '@beech/core'

const match = await verifyHashField(storedHash, candidatePlaintext)
```

All policy resolution **must** go through `resolvePolicies(branch)` from `@beech/core`. Never inline-check `branch.policies?.x ?? default`.

```typescript
import { resolvePolicies } from '@beech/core'

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

## 4. The Botanical Engine

The Botanical Engine decouples physical storage (database) from the semantic surface (API) using a two-identity model.

| Identity | Location | Example | Mutability |
|---|---|---|---|
| **ID** (internal) | D1 JSON column | `"br01"` | **Immutable** |
| **Alias** (API) | Seed definition | `"title"` | **Mutable** (Rename freely) |

### Translation Logic

The engine uses two pure functions in `packages/core/src/engine.ts`:

1. **`apiToDb`**: Maps aliases to IDs. Unknown fields are discarded (fail-closed).
2. **`dbToApi`**: Maps IDs back to aliases. Normalizes legacy asset formats.

### Data Flow Diagram

[![Botanical Engine Data Flow](https://mermaid.ink/img/pako:eNqdk29vmzAQxr_K6d40kWiDSQKpX1TKAlsrtU1VWF9MSJMDXmIV7Mwx2zrEd58JSSol6v4hIfCdn9-dH9s1ZirnSHHDv1ZcZjwUbKlZmUqwz5ppIzKxZtLArBBcmtP49OEGetdKqv5p7p0yTIqMFRDJpZD8dEZIUtlFO_751dUrkMLDPE5gkClpbG5AN5znUEOKRpiCp0jt7zUvCpUiNB3mVW1Rx_UpsLVIVLjotSTHorYgaHa9H88_P2qnLb3QLvlz5ZBQuLmPo8fEfpI57Jbw2b5a8A30cmZYH56mtx-jGHpn9QF84DZn_b0398pwUN-4hpYbG6WtD9-FWYEoy8qwhV3DM3_Z_NbLD9GxlQMq8jd6j6PbaJZA2yW8f5zfHS-gk4Xk_x063Zt8kajpWhz2puX809b81amwus4eCp7rvqlDB5da5EiNrriDJdcla4dYt0SrWfFyp8mZfk4xla3GHupPSpV7mVbVcoX0Cys2dlStrZ_7G3aIai5zrmeqkgbpkEy2EKQ1_kBKvNHFeBwMCZkEwcQP3JGDL0g9Qi4mwejSI94w8F3f9xsHf27rujYxdpDnwp6Su-5ub6948wusUTXN?type=png)](https://mermaid.live/edit#pako:eNqdk29vmzAQxr_K6d40kWiDSQKpX1TKAlsrtU1VWF9MSJMDXmIV7Mwx2zrEd58JSSol6v4hIfCdn9-dH9s1ZirnSHHDv1ZcZjwUbKlZmUqwz5ppIzKxZtLArBBcmtP49OEGetdKqv5p7p0yTIqMFRDJpZD8dEZIUtlFO_751dUrkMLDPE5gkClpbG5AN5znUEOKRpiCp0jt7zUvCpUiNB3mVW1Rx_UpsLVIVLjotSTHorYgaHa9H88_P2qnLb3QLvlz5ZBQuLmPo8fEfpI57Jbw2b5a8A30cmZYH56mtx-jGHpn9QF84DZn_b0398pwUN-4hpYbG6WtD9-FWYEoy8qwhV3DM3_Z_NbLD9GxlQMq8jd6j6PbaJZA2yW8f5zfHS-gk4Xk_x063Zt8kajpWhz2puX809b81amwus4eCp7rvqlDB5da5EiNrriDJdcla4dYt0SrWfFyp8mZfk4xla3GHupPSpV7mVbVcoX0Cys2dlStrZ_7G3aIai5zrmeqkgbpkEy2EKQ1_kBKvNHFeBwMCZkEwcQP3JGDL0g9Qi4mwejSI94w8F3f9xsHf27rujYxdpDnwp6Su-5ub6948wusUTXN)

---

## 5. The Atomic Data Model

### SQL Schema

```sql
CREATE TABLE content_entries (
    id          TEXT PRIMARY KEY,     -- UUID v4
    schema_slug TEXT NOT NULL,        -- e.g., "progetti"
    slug        TEXT NOT NULL,        -- URL identifier
    status      TEXT NOT NULL DEFAULT 'draft',
    data        TEXT NOT NULL DEFAULT '{}', -- JSON blob (Botanical IDs)
    created_at  INTEGER DEFAULT (unixepoch()),
    updated_at  INTEGER DEFAULT (unixepoch())
);

```

### Design Decisions

-   **Single Table + JSON**: Eliminates SQL migrations when adding fields.

-   **Application-Level Validation**: Handled by Zod in `packages/core`.

-   **Top-level Columns**: `status` and `slug` are outside the JSON for high-performance SQL indexing.


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

2.  **Shared Promotion**: If two features need the same logic, it is promoted to the `shared` layer or `@beech/core`.

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

## 9. Pending Draft Workflow

### Overview

The pending draft system allows editorial content types to maintain a **separate draft** on top of a live (published) entry. The live content in `data` is never touched until the draft is explicitly published.

This feature is opt-in per seed via the `allowDrafts` flag in `@beech/core`:

```typescript
// packages/core/src/seeds.ts
export const ARTICOLO_SEED: Seed = {
  slug: 'articoli',
  allowDrafts: true,  // ← enables draft endpoints for this type
  // ...
}
```

Seeds without `allowDrafts: true` (e.g. `messaggi`, `clienti`) return `405 Method Not Allowed` on draft endpoints — they have no concept of editorial workflow.

### Storage

A single nullable column `draft_data TEXT` sits alongside `data` in `content_entries` (migration `0018_draft_data.sql`). It stores the same JSON-with-Botanical-IDs format as `data`.

```
draft_data IS NULL     → no pending draft
draft_data IS NOT NULL → pending draft exists
```

The `CASE WHEN draft_data IS NOT NULL THEN 1 ELSE 0 END as has_pending_draft` expression is projected in all list and detail SELECT queries so that `ContentEntry.hasPendingDraft` is always populated without transferring the full draft JSON in list views.

### API Surface

All draft endpoints are JWT-protected (internal API only — no public API exposure).

| Method | Path | Description |
|---|---|---|
| `PUT` | `/api/content/:slug/:id/draft` | Create or overwrite the pending draft. Validates fields (relaxed: `enforceRequiredFields: false`). Blocks sensitive fields (`privacy !== 'plain'`). Botanical Engine applied on write. |
| `GET` | `/api/content/:slug/:id/draft` | Read the pending draft. Returns `{ data: Record<string, unknown> }` with aliases (Botanical Engine applied on read). Visibility policy enforced. |
| `POST` | `/api/content/:slug/:id/draft/publish` | Promote draft → live in a single atomic SQL statement (`SET data = draft_data, draft_data = NULL, status = 'published'`). |
| `DELETE` | `/api/content/:slug/:id/draft` | Discard the pending draft (`SET draft_data = NULL`). Live content is unaffected. |

### Data Flow

```
Editor saves changes
       │
       ▼
PUT /:slug/:id/draft
  validateAndSanitizeSeedPayload (operation=update, enforceRequired=false)
  apiToDb → draft_data column (data column untouched)
       │
       ▼ (review / approval)
POST /:slug/:id/draft/publish
  UPDATE SET data = draft_data, draft_data = NULL, status = 'published'  ← atomic
       │
       ▼
Live content updated, draft cleared
```

### Invariants

- **`data` is never modified by draft endpoints.** Only `PUT /draft/publish` touches `data`.
- **Botanical Engine applies identically to `draft_data`.** `apiToDb` on write, `dbToApi` on read — same as regular content.
- **Sensitive fields (`privacy: 'hash'`) are blocked from drafts** — same guard as `PUT /:slug/:id`.
- **`hasPendingDraft` in GET responses** is computed server-side via SQL expression, not by transferring `draft_data` in list queries.

### Implementation Files

| File | Role |
|---|---|
| `apps/api/migrations/0018_draft_data.sql` | Adds `draft_data TEXT` column |
| `apps/api/src/features/draft/draft.handler.ts` | VSA slice with 4 route handlers |
| `apps/api/src/features/draft/draft.test.ts` | Unit tests (20 cases) |
| `apps/api/src/shared/apply-policies.ts` | Shared `applyPrivacy` / `applyVisibility` (extracted from `content.ts` for reuse) |
| `packages/core/src/types.ts` | `Seed.allowDrafts?: boolean` |
| `packages/core/src/seeds.ts` | `allowDrafts: true` on `articoli`, `pagine` |

---

---

## 10. Performance Layer

### FTS5 — Application-Layer Sync

La sincronizzazione della virtual table `content_fts` era originariamente gestita da tre trigger SQL (`fts_after_insert`, `fts_after_update`, `fts_after_delete`) che hardcodavano i branch ID degli attuali seed di esempio (`art_01`, `prd_01`, …). Questi trigger rompevano silenziosamente l'indicizzazione per qualsiasi seed con ID diversi.

I trigger sono stati rimossi (migration `0019`). La sincronizzazione avviene ora a livello applicativo in `apps/api/src/shared/fts-sync.ts`:

```typescript
// Usato da content.ts (create/update/delete) e draft.handler.ts (publish)
import { syncFts, deleteFts } from './shared/fts-sync'

syncFts(db, entryId, schemaSlug, seed, dbPayload, status)
  .catch(err => console.warn('[FTS] sync failed:', err))
```

`syncFts` usa il Botanical Engine (`dbToApi`) e le policy del seed (`resolvePolicies`) per estrarre i campi da indicizzare in modo generico — funziona per qualsiasi seed definito dal developer. L'estrazione è:

| Slot FTS | Logica di risoluzione |
|---|---|
| `title` | `apiData[seed.displayNameAlias]` |
| `body` | Primo branch `richtext` o `text` diverso dal `displayNameAlias`; testo estratto ricorsivamente dal JSON TipTap |
| `tags` | Primo branch `json` il cui alias contiene `"tag"` |

Le chiamate a `syncFts`/`deleteFts` sono fire-and-forget (`.catch()` silenzioso): un fallimento FTS non blocca mai l'operazione principale.

### Indici Compositi su `content_entries` (migration `0020`)

Il pattern di query più frequente — `WHERE schema_slug = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?` — era coperto solo da un indice su `schema_slug`. Tre indici compositi ottimizzano i casi principali:

```sql
-- Lista filtrata per status + ordinamento
CREATE INDEX idx_ce_slug_status_created ON content_entries(schema_slug, status, created_at DESC);

-- Widget "modificati di recente"
CREATE INDEX idx_ce_slug_updated ON content_entries(schema_slug, updated_at DESC);

-- Filtro bozze pendenti (partial index)
CREATE INDEX idx_ce_draft_pending ON content_entries(schema_slug) WHERE draft_data IS NOT NULL;
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