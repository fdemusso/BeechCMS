# Beech CMS – System Map

## Overview

This high-level system map is designed for onboarding new contributors and for AI tools. It summarizes the **tech stack**, **folder architecture**, and **non-negotiable conventions** without diving into implementation details (covered by the documents in the `docs/` directory).

> **AI Guidance:**
> - **Do** read this document to understand the overall architecture before diving into specific modules.
> - **Do not** rely on this file for low-level code snippets; consult the detailed docs in `docs/` and `_config/`.
> - **Token optimization:** Reference only the sections you need to reduce token usage.

---

## Documentation Index

| Document | Covers |
|---|---|
| `README.md` | Project overview, Botanical Engine primer, tech stack, getting started |
| `docs/architecture.md` | Monorepo topology, Turborepo pipeline, `@beechcms/core` engine, Botanical Engine, Per-type SQL model, VSA architecture, subsystem abstractions |
| `docs/api-reference.md` | Auth, Internal Content API, Media Engine, Public API, Widget API, Automations CRUD API |
| `docs/content-api.md` | Public Content API & TypeScript SDK reference |
| `docs/email-module.md` | Email module architecture, localization, templates, custom providers |
| `docs/observability-and-notifications.md` | Abstractions for logging, notifications, and cross-cutting utilities (Clock/IdGenerator) |
| `docs/vertical-slice.md` | Guide to Vertical Slice Architecture (VSA) implementation in Beech CMS |
| `_config/release.md` | Release script, versioning scheme, preview vs stable workflow |
| `docs/automations.md` | Automation guide, setting variables, and template grammar |
| `docs/custom-widgets.md` | `@beechcms/widget-sdk` contract for authoring custom dashboard widgets |
| `_config/architecture.md` | Strict AI architectural prompt and invariants |

---

## Tech Stack (with versions)

- **Frontend (Dashboard)**
  - **React**: `^19.2.5`
  - **React DOM**: `^19.2.5`
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
    - `sonner`: `^2.0.7` (toast notifications)
    - `recharts`: `^3.8.0` (charts for analytics/widgets)
    - `react-day-picker`: `^9.14.0` (date picker)
    - `react-medium-image-zoom`: `^5.4.3` (image zoom in gallery/media)
  - **Forms**
    - `react-hook-form`: `^7.75.0` + `@hookform/resolvers`: `^5.2.2` (used in settings, entry editor forms)
    - `zod`: `^4.4.3` (client-side validation, mirrors the core Zod schemas)
  - **Drag & Drop**
    - `@dnd-kit/core`: `^6.3.1`, `@dnd-kit/sortable`: `^10.0.0`, `@dnd-kit/utilities`: `^3.2.2` (used by `LayoutBuilderDialog`)
  - **Utilities**
    - `date-fns`: `^4.1.0` (date formatting)
    - `lowlight`: `^3.3.0` (syntax highlighting in TipTap code blocks)
  - **Internationalisation (i18n)**
    - `i18next` `^26.0.6`, `react-i18next` `^17.0.4`, `i18next-browser-languagedetector` `^8.2.1`
    - Setup: `apps/dashboard/src/lib/i18n.ts` — initialized before render via `import '@/lib/i18n'` in `main.tsx`.
    - Supported languages: `en` (default), `it`. Dictionaries at `apps/dashboard/src/locales/{en,it}.json` (namespaced: `common`, `dashboard`, `editor`, `settings`).
    - Language preference persisted in `localStorage` under key `beech_language`. Changing language in Settings → Interfaccia applies **immediately** via `i18n.changeLanguage()`.
    - Language switcher UI component: `apps/dashboard/src/components/ui/language-switcher.tsx`.
    - **Must not** use i18n for content data (Seed/Branch values) — only for dashboard UI strings.
  - **Rich text**
    - TipTap (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/pm`): `^3.22.4`
    - Implemented as a vertical slice at `apps/dashboard/src/features/richtext-editor/` with public API via `index.ts`. Persists JSON with envelope `{ schemaVersion: 1, doc }` aligned to `@beechcms/core` (`renderRichText`, validation in `validation.ts`).
  - **Build & Quality**
    - ESLint 9 (`eslint` `^9.39.1`, `typescript-eslint` `^8.48.0`)
    - Vitest `^3.2.4`, Testing Library (`@testing-library/react`, `@testing-library/jest-dom`)

- **Backend / API**
  - **Runtime**: Cloudflare Workers
  - **HTTP Framework**: `hono` `^4.11.9`
  - **Authentication**: `jose` `^6.1.3` (JWT), `bcryptjs` `^2.4.3` (password hashing), [Resend](https://resend.com) REST API (password reset emails — optional, activated by `RESEND_API_KEY`)
  - **Media / Storage**: `@aws-sdk/client-s3` `^3.995.0` + `@aws-sdk/s3-request-presigner` `^3.995.0` for S3-compatible interaction with Cloudflare R2 (presigned upload URLs)
  - **Background tasks**: `@upstash/qstash` `^2.11.0` — `QStashNotificationService` dispatches background notifications via Upstash QStash (opt-in alternative to `BackgroundNotificationService`)
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
    - System tables: `seeds` (persisted content type definitions), `seed_meta` (version token caching), `analytics`, `system_stats`, `media_objects`, `content_event_log` (activity log), `dashboard_layouts` (per-scope Dashboard Composer layouts; `scope`, `layout` JSON, `updated_at`, `updated_by`).
    - Automation table: `automations` (id, seed_slug, name, enabled, trigger_event, trigger_cron, trigger_conditions JSON, actions JSON, created_at, updated_at). Indexed on `seed_slug` and `enabled`.

- **Architecture & Tooling**
  - Monorepo **Turborepo** (`turbo` `^2.8.7`) with **pnpm workspaces**
  - Shared package `@beechcms/core` (version `0.5.0`) for types, seeds, and the Botanical Engine
  - Tooling package `@beechcms/cli` providing the unified CLI wrapper (`pnpm beech`)

---

## Folder Architecture

```text
BeechCMS/
├── apps/
│   ├── api/           # REST API (Hono + Cloudflare Workers/D1/R2) — Vertical Slice Architecture
│   └── dashboard/     # React frontend (Vite + Tailwind + Field Renderers) — Vertical Slice Architecture
├── packages/
│   ├── cli/           # @beechcms/cli – Unified Developer Tooling and command handlers
│   ├── core/          # @beechcms/core – Botanical Engine and shared types
│   ├── widget-sdk/    # @beechcms/widget-sdk – Custom dashboard widgets SDK
│   └── client/        # @beechcms/client – Consumer TypeScript SDK
├── docs/              # Public VitePress documentation
├── _config/           # AI system prompts and repository architecture maps
├── package.json       # Root: workspaces, Turbo scripts
├── tsconfig.json      # Base TypeScript config
└── turbo.json         # Turbo pipeline (dev, build, test)
```

### `apps/api` – Cloudflare Workers API (VSA)

- **Main responsibilities**
  - Modularized by feature under `src/features/` (e.g., `content`, `auth`, `notifications`, `email`).
  - Auth routes (`/auth/login`, `/auth/refresh`, `/auth/logout`) — see `docs/api-reference.md`.
  - Dynamic content routes (`/api/content/:slug`, `/api/content/:slug/facets`, `/api/content/:slug/:id`).
  - Statistics and analytics endpoints (`/api/content/stats/total`, `/api/content/stats/cloudflare`, `/api/content/stats/storage/sync`).
  - Public routes (`/api/v1/public/health`, `/api/v1/public/:seed`, `/api/v1/public/:seed/add`, `/api/v1/public/:seed/edit/:id`) protected by API key — see `docs/frontend-guide.md`.
  - Media upload and delivery (`/api/upload`, `/api/media/:key`).
  - Automation CRUD routes (`/api/automations`, `/api/automations/:id`, `/api/automations/:id/toggle`).
- **Key integrations**
  - Imports types and functions from `@beechcms/core` (`getSeed`, Botanical Engine).
  - Uses Cloudflare D1 for persistence (schema hydrated dynamically at runtime from the `seeds` table; initialized via `beech init --db` or `beech onboard`).
  - Uses Cloudflare R2 for binary files.

### `apps/dashboard` – Schema-driven React Dashboard

- **Main responsibilities**
  - Admin UI for managing content via the API.
  - Schema-driven rendering of forms, table, and gallery views via the FieldRenderers registry.
  - Filtering, sorting, searching, and view switching through `ContentToolbar`.

### `packages/core` – `@beechcms/core` (Botanical Engine)

- **Main responsibilities**
  - Shared typings: `Branch`, `Seed`, `DbPayload`, `ApiPayload`.
  - **Botanical Engine** — generates SQL DDL and optimized queries from Seed definitions.
  - **Seed Registry** (`SEED_REGISTRY`, `getSeed`) — defines content schemas and validation.
  - Schema-driven validation (`validateAndSanitizeSeedPayload`) — reused by both the internal and public API.
  - RichText schema and sanitization (`richtext.ts`, `richtext-render.ts`).

---

## Non-Negotiable Conventions

- **Schema-driven everywhere**
  - **Must** use the Botanical Engine for all database interactions.
  - **Must** declare `displayNameAlias` on every `Seed`.
  - **Branch policies** must be enforced via `resolvePolicies`.
  - **Pending drafts** are opt-in: set `allowDrafts: true` on the Seed to enable the `/draft` endpoint family. Uses mirror tables `content_{slug}_drafts`.
  - **Must** treat the D1 database (`seeds` table) as the single canonical source of truth for content types. Running workers load definitions dynamically at runtime.
  - **Must** perform destructive operations only via the authorized admin API routes (`/api/seeds/...`) and after explicit confirmation checks.

- **Monorepo & shared code**
  - **Must** place shared logic and types in `@beechcms/core` and consume them from both apps.
  - **Must not** duplicate types, translation functions, or Seed definitions across apps.

- **Centralized content API**
  - **Must** use the dynamic routes `POST/GET/PUT/DELETE /api/content/:slug[/:id]` for all content manipulation.
  - **Must not** create per-entity controllers (e.g., `/api/projects`) that bypass the Content Engine.

- **Authentication & security**
  - **Must** follow the JWT + refresh token flow: 15-min access token via `jose`, opaque refresh token hashed in D1, `HttpOnly SameSite=Strict` cookie, token rotation.
  - **Must** store the access token **in-memory only** (`_accessToken` in `api.ts`). Never write it to `localStorage`, `sessionStorage`, or cookies from the client.
  - **Must** use `useAuth()` from `apps/dashboard/src/lib/auth-context.tsx` for auth state and user info in components. Never read `localStorage` for token presence checks.

- **Automation Engine**
  - **Must** fire automations from content handlers via `c.get('scheduler').waitUntil(c.get('automationRunner').run(...))` — never call `AutomationRunner` directly from a handler.
  - **Must not** import concrete implementations (`AutomationRunner`, `D1AutomationRepository`) from inside automation feature handlers — only interact through the `IAutomationRunner` and `IAutomationRepository` interfaces on `c.var`.
  - **Must** use `IScheduler` (injected as `c.get('scheduler')`) for any operation that must outlive the HTTP response — never call `c.executionCtx.waitUntil(...)` directly in handlers.
