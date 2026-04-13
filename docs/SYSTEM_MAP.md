# 🌳 Beech CMS – System Map

## Overview
This high‑level system map is designed for onboarding new contributors and for AI tools. It summarizes the **tech stack**, **folder architecture**, and **non‑negotiable conventions** without diving into implementation details (covered by other docs in `docs/`).

> **AI Guidance:**
> - **Do** read this document to understand the overall architecture before diving into specific modules.
> - **Do not** rely on this file for low‑level code snippets; consult the detailed docs linked throughout.
> - **Where to find context:** Follow the links to `README.md`, `monorepo.md`, and the individual engine docs for deeper information.
> - **Token optimization:** Keep prompts concise; reference only the sections you need (e.g., "Tech Stack" or "Folder Architecture") to reduce token usage.

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
  - **Rich text & advanced interactions**
    - TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`): `^3.20.0`
  - **Build & Quality**
    - ESLint 9 (`eslint` `^9.39.1`, `typescript-eslint` `^8.48.0`)
    - Vitest `^3.2.4`, Testing Library (`@testing-library/react`, `@testing-library/jest-dom`)

- **Backend / API**
  - **Runtime**: Cloudflare Workers
  - **HTTP Framework**: `hono` `^4.11.9`
  - **Authentication**
    - `jose` `^6.1.3` for JWT
    - `bcryptjs` `^2.4.3` for password hashing
  - **Media / Storage**
    - `@aws-sdk/client-s3` `^3.995.0` for S3‑compatible interaction with Cloudflare R2
  - **Infra & DX**
    - `wrangler` `^4.4.0`
    - Worker Types: `@cloudflare/workers-types` `^4.20260213.0`
    - Vitest `^3.2.4` for API testing

- **Database & Storage**
  - **Database**: Cloudflare D1 (SQLite edge)
  - **Object Storage**: Cloudflare R2 via S3 API
  - **Data Model:**
    - Single table `content_entries` with SQL metadata and a JSON `data` column (see `[content-engine.md](content-engine.md)`).
    - Authentication tables (`users`, `refresh_tokens`) (see `[auth.md](auth.md)`).

- **Architecture & Tooling**
  - Monorepo **Turborepo** (`turbo` `^2.8.7`) with **npm workspaces**
  - Repo‑wide TypeScript (`typescript` `^5.9.3`) with a shared `tsconfig.json`
  - Shared package `@beech/core` (version `0.0.0`) for types and the Botanical Engine

For a narrative description of the stack and motivations, see the `[README.md](README.md)` (Tech Stack section).

---

## Folder Architecture

A concise view of the monorepo (details in `[monorepo.md](monorepo.md)`):

```text
beech-cms/
├── apps/
│   ├── api/           # REST API (Hono + Cloudflare Workers/D1/R2)
│   └── dashboard/     # React frontend (Vite + Tailwind + Field Renderers)
├── packages/
│   └── core/          # @beech/core – Botanical Engine and shared types
├── docs/              # Architectural documentation
├── package.json       # Root: workspaces, Turbo scripts
├── tsconfig.json      # Base TypeScript config
└── turbo.json         # Turbo pipeline (dev, build, test)
```

### `apps/api` – Cloudflare Workers API

- **Main responsibilities**
  - Exposes authentication routes (`/auth/login`, `/auth/refresh`, `/auth/logout`) – see `[auth.md](auth.md)`.
  - Exposes dynamic content routes (`/api/content/:slug`, `/api/content/:slug/facets`, `/api/content/:slug/:id`) – see `[content-engine.md](content-engine.md)` and `[botanical-engine.md](botanical-engine.md)`.
  - Exposes public routes (`/api/v1/public/health`, `/api/v1/public/:seed`, `/api/v1/public/:seed/add`, `/api/v1/public/:seed/edit/:id`) protected by API key – see `[public-api.md](public-api.md)`.
  - Handles media upload and delivery (`/api/upload`, `/api/media/:key`) – see `[media-engine.md](media-engine.md)`.
- **Key integrations**
  - Imports types and functions from `@beech/core` (`getSeed`, `apiToDb`, `dbToApi`, Seed registry).
  - Uses Cloudflare D1 for persistence (migrated via `db:migrate:local`).
  - Uses Cloudflare R2 for binary files, storing only URLs in `data`.
- **Important files**
  - CRUD handler: `apps/api/src/content.ts` (described in `[content-engine.md](content-engine.md)`).
  - Media handling: `apps/api/src/upload.ts`, `apps/api/src/media-utils.ts` (see `[media-engine.md](media-engine.md)`).
  - Authentication & token management: handlers described in `[auth.md](auth.md)` with DB schema for `refresh_tokens`.

### `apps/dashboard` – Schema‑driven React Dashboard

- **Main responsibilities**
  - Admin UI for managing Seeds/Branches and content via the API.
  - Schema-driven rendering of forms, table, and gallery views via Field Renderers (see `[field-renderers.md](field-renderers.md)`).
  - Filtering, sorting, searching, and view creation through `ContentToolbar` (see `[dashboard-components.md](dashboard-components.md)`).
- **UI structure (excerpt)**
  - `apps/dashboard/src/components/content-toolbar/`: modular toolbar for view switching, filters, sorting, search, and entry creation.
  - `apps/dashboard/src/components/content-gallery/`: gallery view (card grid + read-only peek panel) integrated in `ContentListPage`.
  - `apps/dashboard/src/components/fields/`: Field Renderers infrastructure (display/edit per `Branch` type), described in `[field-renderers.md](field-renderers.md)`.
    - `FieldDisplay.tsx`, `FieldEdit.tsx`, `registry.ts`, `display/*.tsx`, `edit/*.tsx`.
  - Entry editing pages (e.g., `EntryEditorPage`) consume Field Renderers and the Seed from the core.
  - Table and Gallery reuse the same server-side dataset and stay schema-driven; table columns come from `Seed.branches`, gallery cards use branch alias/type heuristics.
  - Key integrations: consumes `@beech/core` for shared types and logic; calls only documented APIs (`/auth/*`, `/api/content/*`, `/api/upload`, `/api/media/*`).

### `packages/core` – `@beech/core` (Botanical Engine)

- **Main responsibilities**
  - Defines shared typings: `Branch`, `Seed`, `DbPayload`, `ApiPayload`, etc.
  - Implements the **Botanical Engine** (`apiToDb`, `dbToApi`) that translates between API aliases and internal IDs – see `[botanical-engine.md](botanical-engine.md)`.
  - Maintains the **Seed Registry** (`SEED_REGISTRY`, `getSeed`, `PROJECT_SEED`) that defines content schemas.
- **Structure** (from `[botanical-engine.md](botanical-engine.md)` and `[monorepo.md](monorepo.md)`)
  - `packages/core/src/index.ts` – barrel export.
  - `packages/core/src/types.ts` – types `Branch`, `Seed`, etc.
  - `packages/core/src/engine.ts` – functions `apiToDb`, `dbToApi`.
  - `packages/core/src/seeds.ts` – Seed definitions and registration in `SEED_REGISTRY`.
  - `packages/core/src/validation.ts` – schema-driven validation/sanitization foundation reused by Public API.
- **Build**
  - `npm run build -w @beech/core` produces `dist/` with JS and `.d.ts`, consumed by `apps/api` and `apps/dashboard`.

### `docs/` – Architectural Documentation

- Primary documents:
  - `[README.md](README.md)` – project overview and tech stack.
  - `[monorepo.md](monorepo.md)` – monorepo architecture.
  - `[botanical-engine.md](botanical-engine.md)` – alias ↔ ID layer.
  - `[content-engine.md](content-engine.md)` – Content Engine SQL/JSON.
  - `[public-api.md](public-api.md)` – Public Slug API (`/api/v1/public/*`) with API key auth.
  - `[media-engine.md](media-engine.md)` – media upload and delivery.
  - `[auth.md](auth.md)` – JWT, refresh token, login, rate limiting.
  - `[dashboard-components.md](dashboard-components.md)` – ContentToolbar + DataTable.
  - `[field-renderers.md](field-renderers.md)` – Registry Pattern for UI fields.
  - `[field-types-roadmap.md](field-types-roadmap.md)` and `[field-types-action-plan.md](field-types-action-plan.md)` – field type roadmap and action plan.

> [!NOTE]
> **Performance Reminder:** The Botanical Engine currently operates with O(N*M) lookup. For high-scale schemas, implement Map-based lookup as documented in `[botanical-engine.md](botanical-engine.md)`.


---

## Key Flows

- **Authentication (`/auth/*`)** – see `[auth.md](auth.md)`
  - Login (`POST /auth/login`): validates credentials with `bcryptjs`, generates JWT via `jose.SignJWT`, creates a UUID refresh token, stores its hash in D1 (`refresh_tokens`), and sets an httpOnly cookie.
  - Refresh (`POST /auth/refresh`): reads the refresh token cookie, validates it in D1, rotates the token (revokes the old one, creates a new one), and returns a new access token.
  - Logout (`POST /auth/logout`): revokes the refresh token in the DB and clears the cookie.

- **Content CRUD (`/api/content/:slug`)** – see `[content-engine.md](content-engine.md)` and `[botanical-engine.md](botanical-engine.md)`
  - **Write (POST/PUT):**
    - Request body uses alias fields (e.g., `{ "title": "Project X" }`).
    - `getSeed(slug)` from the core maps aliases to internal IDs via `apiToDb`.
    - Serialized into the `data` JSON column of `content_entries`.
  - **Read (GET):**
    - Retrieves row from D1, parses `data`, maps internal IDs back to aliases via `dbToApi`.
    - Returns payload with `data` in alias form plus metadata (`id`, `schema_slug`, `slug`, `status`, `created_at`, `updated_at`).
    - Supports query params (`search`, `sortBy`, `sortDir`, `filters`, `page`, `limit`) for server‑side pagination and filtering.
  - **Facets (`GET /api/content/:slug/facets`):** computes distinct values for `status` and tags for use in the toolbar, filters, and conditional colors.

- **Media Engine (`/api/upload`, `/api/media/:key`)** – see `[media-engine.md](media-engine.md)`
  - Upload: Dashboard calls `POST /api/upload` with multipart/form-data; API validates type/size, stores file in R2 via `@aws-sdk/client-s3`, returns a public URL.
  - Media service: `GET /api/media/:key` fetches the file from R2 with aggressive caching.
  - Cleanup: `DELETE /api/content/:slug/:id` inspects `data` for URLs under `/api/media/*` and issues a `DeleteObjectCommand` to R2.

- **Public Slug API (`/api/v1/public/*`)** – see `[public-api.md](public-api.md)`
  - API key middleware supports split keys (`PUBLIC_READ_API_KEY`, `PUBLIC_WRITE_API_KEY`) via header `X-API-Key`.
  - Seed-level capabilities (`allowPublicRead`, `allowPublicPost`, `allowPublicEdit`) enforce default deny on non-authorized operations.
  - Read endpoint supports id lookup, filters, search, pagination, latest, field projections, with default visibility `published` only.
  - Write endpoints (`add`/`edit`) sanitize/validate payloads, enforce slug uniqueness, support idempotency via `Idempotency-Key`, and use prepared statements.
  - Public routes support dedicated rate limiting (`PUBLIC_READ_RATE_LIMITER`, `PUBLIC_WRITE_RATE_LIMITER`).

- **Dashboard Rendering (schema‑driven)** – see `[field-renderers.md](field-renderers.md)` and `[dashboard-components.md](dashboard-components.md)`
  - `EntryEditorPage` loads the Seed (via API + core) and renders each `Branch` using `<FieldEdit branch={branch} ... />`.
  - The concrete field type is resolved by the registry (`registry.ts`), not hard‑coded in the page.
  - In table view, columns are generated dynamically from `Seed.branches` and rendered with `<FieldDisplay>`.
  - In gallery view, card fields (cover/title/excerpt/date/tags) are resolved from seed metadata and shown in card + peek panel read-only.
  - `ContentToolbar` manages user views, filters, sorting, search, and creation tools.

---

## Non‑Negotiable Conventions

- **Schema‑driven everywhere**
  - **Must** use `Seed`/`Branch` and the Botanical Engine (`apiToDb`, `dbToApi`) for all reads/writes of `data`.
  - **Must not** access `data` directly via hard‑coded aliases or DB column names (`br_xxx`) inside the API or Dashboard.

- **Monorepo & shared code**
  - **Must** place shared logic and types in `@beech/core` (`packages/core`) and consume them from `apps/api` and `apps/dashboard`.
  - **Must not** duplicate types, translation functions, or Seed definitions across apps.

- **Centralized content API**
  - **Must** use the dynamic routes `POST/GET/PUT/DELETE /api/content/:slug[/id]` for all content manipulation.
  - **Must not** create per‑entity controllers (e.g., `/api/projects`) that bypass the Content Engine or Seed Registry.

- **Public API contract**
  - **Must** keep external integrations on `/api/v1/public/*` protected with API key auth (read/write split).
  - **Must** enforce per-seed capability flags (`allowPublicRead`, `allowPublicPost`, `allowPublicEdit`) before DB access.
  - **Must** keep payload translation schema-driven via `@beech/core` (`getSeed`, `apiToDb`, `dbToApi`, validation foundation).

- **Authentication & security**
  - **Must** follow the JWT + refresh token flow described in `[auth.md](auth.md)`:
    - Short‑lived access token (15 min) via `jose`.
    - Opaque refresh token stored hashed in D1 (`refresh_tokens`).
    - HttpOnly `SameSite=Strict` cookie, token rotation, and rate limiting.
  - **Must not** store tokens in clear text in the DB or introduce undocumented session mechanisms.

- **UI schema‑driven & Field Renderers**
  - **Must** use `FieldDisplay`/`FieldEdit` and the registry in `apps/dashboard/src/components/fields` for rendering and editing fields.
  - **Must not** write UI that manually switches on field type in tables, forms, or gallery views; rendering must stay schema/registry-driven.

- **Media handling**
  - **Must** use `POST /api/upload` and store only URL values in `file` fields (`string` singolo o `string[]` per `asset-list`).
  - **Must** delegate file deletion to `DELETE /api/content/:slug/:id` (which calls media‑utils).
  - **Must not** upload files directly to R2 from the frontend or store binary blobs in D1.

- **Quality & consistency**
  - **Must** use strict TypeScript (`tsconfig` root), ESLint/TypeScript‑ESLint, and Vitest as configured.
  - **Must not** introduce new state‑management, routing, or UI libraries without updating `SYSTEM_MAP.md` and related documentation.

---

## Document Maintenance

- **Update the stack** whenever a core technology changes (new framework, DB, CI/CD tool).
- **Update folder architecture** when adding new apps in `apps/` or new packages in `packages/`.
- **Update non‑negotiable conventions** when making major architectural decisions (new API patterns, UI approaches, security changes) or performing structural refactors.

`SYSTEM_MAP.md` is the high‑level source of truth for understanding **how Beech CMS is built**. Implementation details remain in the individual docs under `docs/` and in the codebase.