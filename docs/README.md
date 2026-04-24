<img width="1445" height="512" alt="BeechCms's logo" src="https://github.com/user-attachments/assets/62a5b188-4b1f-4f23-9987-7e734f2639a7" />

---

A production-grade, **Edge-Native, Schema-Driven Content Management System** built on Cloudflare's infrastructure.

Beech CMS is not a traditional monolithic CMS — it is a headless, API-first platform where every content type is defined by a typed schema, every field transformation is deterministic, and every byte served originates from the edge.

---

## Table of Contents

- [Why Beech?](#why-beech)
- [Architecture at a Glance](#architecture-at-a-glance)
- [The Botanical Engine](#the-botanical-engine)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Key Design Decisions](#key-design-decisions)

---

## Documentation

| Document | Description |
|---|---|
| [Architecture](./architecture.md) | Structural reasoning: package relationships, storage choices, and the ongoing migration to Vertical Slice Architecture |
| [API Reference](./api-reference.md) | Complete REST API reference — Internal (JWT) and Public (API-key) surfaces, with RFC 7807 error shapes |
| [Frontend Guide](./frontend-guide.md) | Dashboard architecture: FieldRenderer registry, TanStack Query patterns, Shadcn/Tailwind 4 composition, and how to add a new field type |
| [System Map](./SYSTEM_MAP.md) | High-level onboarding map — tech stack, folder structure, and non-negotiable conventions at a glance |
| [Vertical Slice Architecture](./vertical-slice.md) | Guide to the VSA organization model adopted by the project |
| [Sprint: SEO Evolution](./Sprints/seo-evolution.md) | Roadmap for the meta/SEO engine feature |

---

## Why Beech?

### Zero-Latency by Default

Beech runs entirely on **Cloudflare Workers** — V8-isolate-based serverless functions deployed to 300+ edge locations worldwide. There is no cold-start penalty, no origin server to route through, and no region selection to misconfigure. A `GET /api/v1/public/articles` request resolves from the edge node closest to the consumer, querying **Cloudflare D1** (SQLite at the edge) and returning a JSON payload with sub-10ms processing overhead.

### Developer Experience (DX) That Scales

- **One schema definition → everywhere consistent.** You define a `Seed` (a typed content schema) once in `@beech/core`. That definition drives: database writes, API reads, public endpoint permissions, validation rules, form rendering, field display, and filter generation. No drift between layers.
- **Rename a field alias without a migration.** The Botanical Engine separates human-readable aliases (`title`, `publishedAt`) from immutable internal IDs (`br01`, `br02`). You can rename a field alias in the `Seed` definition without touching the database.
- **Monorepo, single source of truth.** Turborepo orchestrates builds so `@beech/core` is always compiled before the apps that depend on it. Types, validation logic, and translation functions are never duplicated.
- **RFC 7807 Problem Details on every error.** Every `4xx` and `5xx` response follows `application/problem+json` with machine-readable `type` URIs and optional field-level `errors` arrays. No ad-hoc error shapes.

---

## Architecture at a Glance

[![Architecture Diagram](https://mermaid.ink/img/pako:eNp9VOFu2zYQfpUDf3WYW0dOYmf-McCW5NipjaaW2mCTh4CSzhYTmRQoKq2bBOg77A33JDtSbqAUwwQI4Hf8PvLj3ZGPLFM5sjHblupLVnBtIA42Euirm3SneVWAXwqUZskPqCFpATj0V0u03yRZI88MBLwuUsV1vtnIz8Ig_Aoxl5Hh2T18bFAfOpppEn41qCUvwVeybvaoSRVjbSCy0j7MtJIGZQ6TqjoKCW3kTwbDfIdHe3YI_3z_m0yrJt-WXCPcKH2Puu7s7CdzJRVMrhe0Ia-qus8r0ZkPkqubGCaNKWAl8rzEL7QOUe9UbU-UZvpQmbvuimHiO6sGQrkT0pL99acAHgSHqTJcioyO2c51ZLPkuklLkR2tWBv9B69fuWCftqI4vMdu1i6TT1WpeA5zLsmZTdn1hygGp23c1P-kylf6R6pSxKzoZxRwCauoRHyHtYt09psnP_t3OROxClIqUZ7GavIqeYskQsxhjTtRG30gdhSGwe06vFxE8foP0uzQWEpHc5V85qXIuRFKwkw1sh2S9qGN40TmEbkw4hta7TU_dE5qv_dJfKgwyrSoqIdpWNudidqDqeYyK3oQpEdZjxpKvF7iv5K1kFvNX_r-pZ9cmI7WZKZ5lapl8ibwXDKjj0vqYDKQtV1xS78WzpLGrca6uDXqHqUNcLoAByOy-pfOUqvkzXoAH9I7pEsVGaWpNMRdYU4NNRMlvrA7xifw9u3vT7Z1p0hG9RP47cTUTRx7iSrD8_6NJoNPMGsJviXA8eIHDoQtCB2Yt2DuwKILrrq0ZQsuHVi1YNZdYNaltXbbbn6Cy652yXpsp0XOxpRm7DF6GvbcQvZoaRtmCtzjho1pmHN9v2Eb-Uyaiss_ldr_kGnV7Ao23vKyJtRUtpECwam6-5eopgSi9qnnDBufeiduETZ-ZF_Z2BucvTs_H5163sVodDEcnZz12IGNB5737mJ09tvAG5yOhifD4fC5x765fU9o4rzHqExUs1X7tLoX9vlfjFG0XA)](https://mermaid.live/edit#pako:eNp9VOFu2zYQfpUDf3WYW0dOYmf-McCW5NipjaaW2mCTh4CSzhYTmRQoKq2bBOg77A33JDtSbqAUwwQI4Hf8PvLj3ZGPLFM5sjHblupLVnBtIA42Euirm3SneVWAXwqUZskPqCFpATj0V0u03yRZI88MBLwuUsV1vtnIz8Ig_Aoxl5Hh2T18bFAfOpppEn41qCUvwVeybvaoSRVjbSCy0j7MtJIGZQ6TqjoKCW3kTwbDfIdHe3YI_3z_m0yrJt-WXCPcKH2Puu7s7CdzJRVMrhe0Ia-qus8r0ZkPkqubGCaNKWAl8rzEL7QOUe9UbU-UZvpQmbvuimHiO6sGQrkT0pL99acAHgSHqTJcioyO2c51ZLPkuklLkR2tWBv9B69fuWCftqI4vMdu1i6TT1WpeA5zLsmZTdn1hygGp23c1P-kylf6R6pSxKzoZxRwCauoRHyHtYt09psnP_t3OROxClIqUZ7GavIqeYskQsxhjTtRG30gdhSGwe06vFxE8foP0uzQWEpHc5V85qXIuRFKwkw1sh2S9qGN40TmEbkw4hta7TU_dE5qv_dJfKgwyrSoqIdpWNudidqDqeYyK3oQpEdZjxpKvF7iv5K1kFvNX_r-pZ9cmI7WZKZ5lapl8ibwXDKjj0vqYDKQtV1xS78WzpLGrca6uDXqHqUNcLoAByOy-pfOUqvkzXoAH9I7pEsVGaWpNMRdYU4NNRMlvrA7xifw9u3vT7Z1p0hG9RP47cTUTRx7iSrD8_6NJoNPMGsJviXA8eIHDoQtCB2Yt2DuwKILrrq0ZQsuHVi1YNZdYNaltXbbbn6Cy652yXpsp0XOxpRm7DF6GvbcQvZoaRtmCtzjho1pmHN9v2Eb-Uyaiss_ldr_kGnV7Ao23vKyJtRUtpECwam6-5eopgSi9qnnDBufeiduETZ-ZF_Z2BucvTs_H5163sVodDEcnZz12IGNB5737mJ09tvAG5yOhifD4fC5x765fU9o4rzHqExUs1X7tLoX9vlfjFG0XA)

---

## The Botanical Engine

The **Botanical Engine** is the translation layer that sits at the heart of Beech CMS. It solves a fundamental data architecture tension: **human-readable API fields vs. stable database identifiers**.

### The Problem It Solves

In a schema-driven CMS, field names evolve. A field called `title` might be renamed to `headline` during a rebranding. In a conventional system, this requires a SQL column rename and a coordinated frontend deployment. In Beech, the database column key is always an immutable internal ID (`br01`, `br02`, etc.). The alias is what changes.

### How It Works

Every content type is defined as a `Seed`:

```typescript
// packages/core/src/types.ts
export interface Branch {
  id: string;        // Immutable DB key, e.g. "br01"
  alias: string;     // Mutable API-facing name, e.g. "title"
  label: string;     // UI label, e.g. "Titolo Progetto"
  type: BranchType;  // "text" | "number" | "boolean" | "json" | "date" | "richtext" | "file"
  format?: "plain" | "markdown" | "html" | "date" | "datetime" | "asset-list";
  multiple?: boolean;
  requiredOnCreate?: boolean;
  requiredOnUpdate?: boolean;
}

export interface Seed {
  slug: string;               // e.g. "progetti"
  label: string;
  allowPublicRead?: boolean;
  allowPublicPost?: boolean;
  allowPublicEdit?: boolean;
  branches: Branch[];
}
```

The two pure translation functions in `packages/core/src/engine.ts`:

```typescript
// API payload (aliases) → DB payload (internal IDs)
export function apiToDb(seed: Seed, payload: Record<string, unknown>): DbPayload {
  const result = {} as DbPayload;
  for (const [alias, value] of Object.entries(payload)) {
    const branchDef = seed.branches.find(branch => branch.alias === alias);
    if (branchDef) result[branchDef.id] = value;
  }
  return result;
}

// DB payload (internal IDs) → API payload (aliases)
export function dbToApi(seed: Seed, data: Record<string, unknown> | null | undefined): ApiPayload {
  if (!data || typeof data !== 'object') return {};
  const result = {} as ApiPayload;
  for (const branch of seed.branches) {
    if (branch.id in data) {
      let value = data[branch.id];
      if (branch.type === 'json' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch { /* retain original */ }
      }
      result[branch.alias] = value;
    }
  }
  return result;
}
```

---

## Tech Stack

| Layer | Technology | Role |
|---|---|---|
| **Runtime** | Cloudflare Workers (V8 Isolates) | Edge execution, zero cold start |
| **API Framework** | Hono | Lightweight, Worker-native HTTP router |
| **Database** | Cloudflare D1 (SQLite) | Edge-colocated relational storage |
| **Object Storage** | Cloudflare R2 | S3-compatible media storage, zero egress cost |
| **Monorepo** | Turborepo + npm Workspaces | Ordered builds, shared packages |
| **Shared Logic** | `@beech/core` | Botanical Engine, types, validation, seeds |
| **Dashboard** | React + Vite | SPA admin interface |
| **UI Primitives** | Tailwind CSS v4 + Shadcn/ui | Utility-first, accessible components |
| **State / Fetching** | TanStack Query v5 | Server state, stale-while-revalidate |
| **Rich Text** | TipTap v3 | ProseMirror-based extensible editor |
| **Auth** | `jose` (JWT) + bcryptjs | Short-lived access tokens, refresh rotation |
| **Validation** | Zod v4 | Compile-time-cached schema validation |
| **Testing** | Vitest | Unit and integration tests across packages |

---

## Project Structure

```
beech-cms/
├── apps/
│   ├── api/             # Hono REST API – Cloudflare Workers
│   │   └── src/
│   │       ├── index.ts   # App entry, CORS, auth routes, middleware
│   │       ├── content.ts # Universal CRUD Content Engine
│   │       ├── upload.ts  # R2 media upload handler
│   │       └── public/    # Public API (/api/v1/public/)
│   └── dashboard/       # React + Vite admin SPA
│       └── src/
│           ├── components/fields/ # FieldDisplay + FieldEdit renderers
│           ├── features/          # Feature slices (content, dashboard, etc.)
│           └── lib/               # API client, utils
├── packages/
│   └── core/            # @beech/core – Single source of truth
│       └── src/
│           ├── types.ts      # Seed, Branch, DbPayload, ApiPayload
│           ├── engine.ts     # apiToDb, dbToApi (Botanical Engine)
│           ├── seeds.ts      # SEED_REGISTRY, getSeed
│           ├── validation.ts # validateAndSanitizeSeedPayload (Zod)
│           └── richtext.ts   # RichText schema and sanitization
├── docs/                # Architecture, API, and frontend documentation
├── turbo.json           # Turborepo pipeline configuration
└── package.json         # Root workspace configuration
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- npm ≥ 11
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) ≥ 4.36

### Installation

```bash
git clone https://github.com/your-org/beech-cms.git
cd beech-cms
npm install
```

### Development

```bash
# Start all packages in parallel (core watcher + api + dashboard)
npm run dev
```

### Database Setup (local D1)

```bash
cd apps/api
npm run db:migrate:local
```

### Build

```bash
npm run build
```

---

## Key Design Decisions

### Why a Single `content_entries` Table?

A single table with a `data TEXT` (JSON) column avoids the proliferation of per-entity tables that require schema migrations for every new content type. The trade-off — application-level schema validation instead of DB constraints — is deliberately offset by the Zod-based `validateAndSanitizeSeedPayload` in `@beech/core`.

### Why Cloudflare D1 and Not Postgres?

D1 is SQLite at the edge. For a headless CMS serving primarily read traffic, the co-location of compute and data on the same edge node eliminates network round-trips.

### Why Separate Read and Write API Keys for the Public API?

Defense-in-depth: a leaked read key cannot be used to modify content. The Public API additionally enforces per-Seed capability flags (`allowPublicRead`, etc.).

### Why `@beech/core` as a Shared Package?

To prevent drift. With `@beech/core` as the single source of truth, a breaking change in the type system is a compile error in every consuming package simultaneously.

---

_Beech CMS — Precision-engineered content infrastructure for the edge._
