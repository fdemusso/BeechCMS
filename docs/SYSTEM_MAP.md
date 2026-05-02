# Beech CMS – System Map

## Overview

This high-level system map is designed for onboarding new contributors and for AI tools. It summarizes the **tech stack**, **folder architecture**, and **non-negotiable conventions** without diving into implementation details (covered by the documents in `docs/nuovidocs/`).

> **AI Guidance:**
> - **Do** read this document to understand the overall architecture before diving into specific modules.
> - **Do not** rely on this file for low-level code snippets; consult the detailed docs linked throughout.
> - **Token optimization:** Reference only the sections you need to reduce token usage.

---

## Documentation

| Document | Covers |
|---|---|
| `[README.md](README.md)` | Project overview, Botanical Engine primer, tech stack, getting started |
| `[architecture.md](architecture.md)` | Monorepo topology, Turborepo pipeline, `@beechcms/core` barrel, Botanical Engine (Schema Compiler), Per-type SQL model, VSA migration |
| `[api-reference.md](api-reference.md)` | Auth, Internal Content API, Media Engine, Public API, Widget API |
| `[frontend-guide.md](frontend-guide.md)` | FieldRenderers, TanStack Query, Tailwind 4, EntryEditorPage, ContentToolbar |
| `[email-module.md](email-module.md)` | Email module architecture, localization, templates |

---

## Tech Stack (with versions)

- **Frontend (Dashboard)**
  - **React**: `^19.2.0`
  - **React DOM**: `^19.2.0`
  - **TypeScript**: `~5.9.3`
  - **Vite**: `^7.3.1`
  - **Tailwind CSS**: `^4.1.18` (with `@tailwindcss/vite`)
  - **UI & State**
    - `@tanstack/react-query`: `^5.90.21`
    - `@tanstack/react-table`: `^8.21.3`
    - `@tanstack/react-virtual`: `^3.13.23`
    - `next-themes`: `^0.4.6`
    - `lucide-react`: `^0.564.0`
    - Components based on `radix-ui` and shadcn (`shadcn` `^4.0.2`)
  - **Internationalisation (i18n)**
    - `i18next` `^26.0.6`, `react-i18next` `^17.0.4`, `i18next-browser-languagedetector` `^8.2.1`
    - Setup: `apps/dashboard/src/lib/i18n.ts` — initialized before render via `import '@/lib/i18n'` in `main.tsx`.
    - Supported languages: `en` (default), `it`. Dictionaries at `apps/dashboard/src/locales/{en,it}.json` (namespaced: `common`, `dashboard`, `editor`, `settings`).
    - Language preference persisted in `localStorage` under key `beech_language` (same key read by `interface-tab.tsx`). Changing language in Settings → Interfaccia applies **immediately** via `i18n.changeLanguage()`.
    - Language switcher UI component: `apps/dashboard/src/components/ui/language-switcher.tsx`.
    - **Must not** use i18n for content data (Seed/Branch values) — only for dashboard UI strings.
  - **Rich text**
    - TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`): `^3.20.0`
    - Implemented as a vertical slice at `apps/dashboard/src/features/richtext-editor/` with public API via `index.ts`. Persists JSON with envelope `{ schemaVersion: 1, doc }` aligned to `@beechcms/core` (`renderRichText`, validation in `validation.ts`).
  - **Build & Quality**
    - ESLint 9 (`eslint` `^9.39.1`, `typescript-eslint` `^8.48.0`)
    - Vitest `^3.2.4`, Testing Library (`@testing-library/react`, `@testing-library/jest-dom`)

- **Backend / API**
  - **Runtime**: Cloudflare Workers
  - **HTTP Framework**: `hono` `^4.11.9`
  - **Authentication**: `jose` `^6.1.3` (JWT), `bcryptjs` `^2.4.3` (password hashing), [Resend](https://resend.com) REST API (password reset emails — optional, activated by `RESEND_API_KEY`)
  - **Media / Storage**: `@aws-sdk/client-s3` `^3.995.0` for S3-compatible interaction with Cloudflare R2
  - **Infra & DX**: `wrangler` `^4.4.0`, `@cloudflare/workers-types` `^4.20260213.0`
  - Vitest `^3.2.4` for API testing

- **Database & Storage**
  - **Database**: Cloudflare D1 (SQLite edge)
  - **Object Storage**: Cloudflare R2 via S3 API
  - **Data Model:**
    - Per-type tables `content_{seed.slug}` for content entries. Each branch is a dedicated SQL column.
    - System columns: `id`, `slug`, `status`, `created_at`, `updated_at`.
    - **Mirror Tables for Drafts:** if a Seed has `allowDrafts: true`, a mirror table `content_{slug}_drafts` handles pending changes.
    - Authentication tables: `users`, `refresh_tokens`.
    - System tables: `analytics`, `system_stats`, `media_objects`, `content_event_log` (activity log).

- **Architecture & Tooling**
  - Monorepo **Turborepo** (`turbo` `^2.8.7`) with **npm workspaces**
  - Shared package `@beechcms/core` (version `0.0.0`) for types, seeds, and the Botanical Engine

---

## Folder Architecture

```text
@beechcms/cms/
├── apps/
│   ├── api/           # REST API (Hono + Cloudflare Workers/D1/R2)
│   └── dashboard/     # React frontend (Vite + Tailwind + Field Renderers)
├── packages/
│   └── core/          # @beechcms/core – Botanical Engine and shared types
├── docs/
│   └── nuovidocs/     # Architectural documentation
├── package.json       # Root: workspaces, Turbo scripts
├── tsconfig.json      # Base TypeScript config
└── turbo.json         # Turbo pipeline (dev, build, test)
```

### `apps/api` – Cloudflare Workers API

- **Main responsibilities**
  - Auth routes (`/auth/login`, `/auth/refresh`, `/auth/logout`) — see `nuovidocs/api-reference.md` §3.
  - Dynamic content routes (`/api/content/:slug`, `/api/content/:slug/facets`, `/api/content/:slug/:id`) — see `nuovidocs/api-reference.md` §4.
  - Statistics and analytics endpoints (`/api/content/stats/total`, `/api/content/stats/cloudflare`, `/api/content/stats/storage/sync`).
  - Public routes (`/api/v1/public/health`, `/api/v1/public/:seed`, `/api/v1/public/:seed/add`, `/api/v1/public/:seed/edit/:id`) protected by API key — see `nuovidocs/api-reference.md` §6.
  - Media upload and delivery (`/api/upload`, `/api/media/:key`) — see `nuovidocs/api-reference.md` §5.
- **Key integrations**
  - Imports types and functions from `@beechcms/core` (`getSeed`, Botanical Engine).
  - Uses Cloudflare D1 for persistence (schema generated via `beech seed:load`).
  - Uses Cloudflare R2 for binary files.
- **Important files**
  - `apps/api/src/index.ts` — app entry, CORS, auth routes, analytics middleware.
  - `apps/api/src/content.ts` — universal CRUD content engine using Botanical Engine.
  - `apps/api/src/shared/query-utils.ts` — query building utilities.

### `apps/dashboard` – Schema-driven React Dashboard

- **Main responsibilities**
  - Admin UI for managing content via the API.
  - Schema-driven rendering of forms, table, and gallery views via the FieldRenderers registry — see `nuovidocs/frontend-guide.md` §2.
  - Filtering, sorting, searching, and view switching through `ContentToolbar` — see `nuovidocs/frontend-guide.md` §7.
- **UI structure**
  - `apps/dashboard/src/components/content-toolbar/` — modular toolbar: view switching, filters, sorting, search, grouping, conditional formats.
  - `apps/dashboard/src/components/content-gallery/` — gallery view (card grid + read-only peek panel).
  - `apps/dashboard/src/components/fields/` — FieldRenderers registry (`FieldDisplay`, `FieldEdit`, `registry.ts`, `display/*.tsx`, `edit/*.tsx`).
  - `apps/dashboard/src/features/richtext-editor/` — TipTap editor slice; only `index.ts` is importable from outside the slice.
  - `apps/dashboard/src/features/dashboard/` — Dashboard cockpit with bento grid widgets and Cloudflare Edge analytics.
  - `apps/dashboard/src/features/widget-data/` — **Widget Data Layer**: typed hooks, formula evaluation, and Axios wrappers for the `/api/widget/*` endpoints. Public API via `index.ts`. See `nuovidocs/frontend-guide.md` §8.
  - `apps/dashboard/src/features/command-palette/` — global command palette.
  - Entry editing pages (`EntryEditorPage`) consume FieldRenderers and the Seed from `@beechcms/core`.
- **Dashboard Seed Config** — sidebar and content-view behaviour is driven by the optional `dashboard` field on each `Seed` (type `DashboardSeedConfig`, defined in `@beechcms/core`). No separate registry or hardcoded map.
  - `icon` — Lucide icon name (string); resolved to a component by `apps/dashboard/src/lib/icon-registry.ts`.
  - `group` — sidebar section label; seeds sharing the same group appear under one collapsible section.
  - `order` — sort order within the group.
  - `hidden` — exclude from sidebar.
  - `features` — per-seed UI toggles: `search`, `filter`, `export`, `bulkDelete`.
  - The sidebar (`AppSidebar`) calls `buildContentMenu(seeds, defaultLabel)` from `apps/dashboard/src/config/dashboard-menu.ts`, which returns `NavGroup[]` — one `NavMain` section per group, sorted and filtered automatically.

### `packages/core` – `@beechcms/core` (Botanical Engine)

- **Main responsibilities**
  - Shared typings: `Branch`, `Seed`, `DbPayload`, `ApiPayload`.
  - **Botanical Engine** — generates SQL DDL and optimized queries from Seed definitions.
  - **Seed Registry** (`SEED_REGISTRY`, `getSeed`) — defines all content schemas.
  - Schema-driven validation (`validateAndSanitizeSeedPayload`) — reused by both the internal and public API.
  - RichText schema and sanitization (`richtext.ts`, `richtext-render.ts`).
- **Barrel export**: `packages/core/src/index.ts` — types, seeds, engine, validation, richtext, slug utils.
- **Build**: `npm run build -w @beechcms/core` produces `dist/` with JS and `.d.ts`, consumed by both apps.

---

## Key Flows

- **Authentication (`/auth/*`)** — see `nuovidocs/api-reference.md` §2–3
  - Login: validates credentials with `bcryptjs`, generates JWT via `jose.SignJWT` (15 min TTL), creates UUID refresh token stored hashed in D1, sets `HttpOnly SameSite=Strict` cookie.
  - Refresh: reads cookie, validates in D1, atomically revokes old token, issues new access + refresh token pair.
  - Logout: revokes refresh token in D1, clears cookie.
  - **Password reset (optional):** enabled only when `RESEND_API_KEY` is set. `GET /auth/features` exposes the flag to the dashboard. `POST /auth/forgot-password` issues a 30-min single-use token (SHA-256 hashed in `password_reset_tokens`) and sends the reset link via Resend (rate-limited: 3/min per IP via `FORGOT_PASSWORD_RATE_LIMITER`). `POST /auth/reset-password` validates the token, updates `password_hash`, marks it used, and revokes all active sessions — atomically via `D1.batch()` — then fires a **"password changed" security notification email** via `waitUntil` (rate-limited: 5/min per IP via `RESET_PASSWORD_RATE_LIMITER`). Both endpoints accept a `locale` field (`en` | `it`) that selects the email language; the dashboard passes `i18n.language` automatically. `APP_URL` must point to the dashboard URL.

- **Content CRUD (`/api/content/:slug`)**
  - **Write (POST/PUT):** payload is validated and serialized into dedicated table columns via Botanical Engine.
  - **Read (GET):** retrieves rows from `content_{slug}`, deserializes complex types, and returns JSON response.
  - Supports server-side pagination, filtering, sorting, and search (via B-tree and FTS5).
  - **Facets (`GET /api/content/:slug/facets`):** computes distinct `status` values and tag sets.

- **Media Engine (`/api/upload`, `/api/media/:key`)** — see `nuovidocs/api-reference.md` §5
  - Upload: `POST /api/upload` multipart → validate MIME/size → `PutObjectCommand` → R2 → increment `system_stats` + INSERT `media_objects` in D1 (via `waitUntil`) → return URL.
  - Serve: `GET /api/media/:key` proxies from R2 with `Cache-Control: public, max-age=31536000, immutable`. Public route, no auth required.
  - Cascade delete: `DELETE /api/content/:slug/:id` extracts R2 keys from `file`/`asset-list` fields, issues `DeleteObjectCommand`, decrementa `system_stats` e rimuove da `media_objects`.

- **Public API (`/api/v1/public/*`)** — see `nuovidocs/api-reference.md` §6
  - Three-level permission model: seed capability flags (`allowPublicRead/Post/Edit`) + split API keys (`PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY`) + published-only filter (`PUBLIC_PUBLISHED_ONLY`).
  - Read endpoint: id lookup, filters, search, pagination, `latest`, field projections. Response è **flat** — content fields at the same level as `id`, `slug`, `status`.
  - **Worker Cache API**: le GET su `/api/v1/public/:seed` vengono messe in cache con TTL 60 secondi via `caches.default` e `waitUntil`. Zero query D1 su cache hit.
  - Write endpoints: fail-closed validation, slug uniqueness, idempotency via `Idempotency-Key`, prepared statements.
  - Dedicated rate limiters: `PUBLIC_READ_RATE_LIMITER`, `PUBLIC_WRITE_RATE_LIMITER`.
  - All errors: RFC 7807 Problem Details (`application/problem+json`).

- **Dashboard Rendering (schema-driven)** — see `nuovidocs/frontend-guide.md`
  - `EntryEditorPage` loads the Seed and renders each `Branch` via `<FieldEdit branch={branch} ... />`. No hardcoded field lists.
  - Field type is resolved by `registry.ts` — no `switch(branch.type)` in page code.
  - Table columns are generated dynamically from `Seed.branches` and rendered with `<FieldDisplay>`.
  - Gallery card slots (cover, title, excerpt, date, tags) are resolved by `resolveCardFields` heuristics from the Seed — no fetch beyond the shared dataset.
  - `ContentToolbar` drives filters, sort, search, grouping, and view switching. Filter columns are derived from `Seed.branches` at runtime via `useToolbarFilters`.

- **Widget Data Layer (`/api/widget/*`)**
  - Five JWT-protected read-only endpoints: `aggregate`, `growth`, `leaderboard`, `list`, `timeseries`.
  - Server side (`apps/api/src/widget.ts`): uses `buildSelectQuery` to generate optimized SQL; applies time-window filters on `created_at`.
  - Client side (`apps/dashboard/src/features/widget-data/`): TanStack Query hooks.

- **Edge Analytics & Stats**
  - **Request Tracking**: middleware in `apps/api/src/index.ts` captures API hits via `c.executionCtx.waitUntil` (zero-latency). La tabella `analytics` ha una colonna `seed` (stringa vuota = globale, `'articoli'` = per-seed). I widget globali filtrano con `seed = ''`.
  - **Storage Monitoring**: `system_stats` counter incremented on upload, decremented on delete, resyncable via `POST /api/content/stats/storage/sync`. La fonte canonica per la media library è `media_objects` (`SUM(size_bytes)`).
  - **Cockpit Dashboard**: bento grid widgets for total contents, visitors, requests, and R2 storage — driven by TanStack Query with 5-minute `staleTime`.

---

## Non-Negotiable Conventions

- **Schema-driven everywhere**
  - **Must** use the Botanical Engine for all database interactions.
  - **Must** declare `displayNameAlias` on every `Seed`.
  - **Branch policies** must be enforced via `resolvePolicies`.
  - **Pending drafts** are opt-in: set `allowDrafts: true` on the Seed to enable the `/draft` endpoint family. Uses mirror tables `content_{slug}_drafts`.

- **Monorepo & shared code**
  - **Must** place shared logic and types in `@beechcms/core` and consume them from both apps.
  - **Must not** duplicate types, translation functions, or Seed definitions across apps.

- **Centralized content API**
  - **Must** use the dynamic routes `POST/GET/PUT/DELETE /api/content/:slug[/:id]` for all content manipulation.
  - **Must not** create per-entity controllers (e.g., `/api/projects`) that bypass the Content Engine.

- **Public API contract**
  - **Must** keep external integrations on `/api/v1/public/*` with split API key auth.
  - **Must** enforce per-seed capability flags before any DB access.
  - **Must** expose errors as RFC 7807 Problem Details with field-level `errors` where applicable.

- **Authentication & security**
  - **Must** follow the JWT + refresh token flow: 15-min access token via `jose`, opaque refresh token hashed in D1, `HttpOnly SameSite=Strict` cookie, token rotation.
  - **Must not** store tokens in plaintext or introduce undocumented session mechanisms.

- **UI schema-driven & FieldRenderers**
  - **Must** use `FieldDisplay`/`FieldEdit` and the registry in `apps/dashboard/src/components/fields/` for all field rendering.
  - **Must not** write UI that switches on `branch.type` in tables, forms, or gallery views.

- **Dashboard sidebar & Seed UI config**
  - **Must** declare all dashboard-specific UI config (icon, group, order, hidden, features) in the `dashboard` field of the `Seed` definition — the only source of truth.
  - **Must not** add slug-to-icon or slug-to-group mappings outside of the Seed's `dashboard` field (no hardcoded maps in `dashboard-menu.ts` or elsewhere).
  - **Must** use `resolveIcon(name)` from `apps/dashboard/src/lib/icon-registry.ts` to convert icon name strings to Lucide components — never import icons directly in menu/sidebar config files.
  - **Must** add new Lucide icons to `icon-registry.ts` before referencing them in a Seed's `dashboard.icon` field.

- **Media handling**
  - **Must** use `POST /api/upload` and store only URL strings in `file` fields (`string` for single, `string[]` for `asset-list`).
  - **Must** delegate file deletion to `DELETE /api/content/:slug/:id`.
  - **Must not** upload files directly to R2 from the frontend or store binary blobs in D1.

- **Widget Data Layer**
  - **Must** use the hooks from `@/features/widget-data` for all widget data access — no direct `api.get('/widget/...')` calls in components.
  - **Must not** import `widget.api.ts` or `query-keys.ts` from outside `features/widget-data/` — only the public `index.ts` barrel.
  - **Must** pass API aliases to `AggregateFormula.column` — never internal `br_XX` IDs.
  - **Must not** add direct D1 queries or content-type-specific aggregation logic in widget components; add a new hook in `features/widget-data/hooks/` instead.

- **Vertical Slice Architecture (dashboard)**
  - **Must** place new feature code in `apps/dashboard/src/features/<feature-name>/` with an `index.ts` public API.
  - **Must not** import directly from another feature's internal files — only from its `index.ts`.
  - **Must** promote logic needed by two or more features to `@beechcms/core` or `src/components/ui` / `src/lib`.

- **Quality & consistency**
  - **Must** use strict TypeScript, ESLint 9 with `typescript-eslint`, and Vitest as configured.
  - **Must not** introduce new state-management, routing, or UI libraries without updating `SYSTEM_MAP.md` and the relevant doc in `nuovidocs/`.

---

## Document Maintenance

- **Update the stack** whenever a core technology changes (new framework, DB, CI/CD tool).
- **Update folder architecture** when adding new apps in `apps/` or new packages in `packages/`.
- **Update non-negotiable conventions** when making major architectural decisions.
- **Update `nuovidocs/`** when APIs, field types, or frontend patterns change — `SYSTEM_MAP.md` links there and does not duplicate content.

`SYSTEM_MAP.md` is the high-level source of truth for understanding **how Beech CMS is built**. Implementation details are in `docs/nuovidocs/` and in the codebase itself.
