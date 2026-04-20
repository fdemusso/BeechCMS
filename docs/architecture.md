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

_Beech CMS Architecture Guide — Built for Scale at the Edge._