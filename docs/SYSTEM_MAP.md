# Beech CMS – System Map

## Overview

This high-level system map is designed for onboarding new contributors and for AI tools. It summarizes the **tech stack**, **folder architecture**, and **non-negotiable conventions** without diving into implementation details (covered by the documents in the `docs/` directory).

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
| `[observability-and-notifications.md](observability-and-notifications.md)` | Abstractions for logging, notifications, and cross-cutting utilities (Clock/IdGenerator) |
| `[vertical-slice.md](vertical-slice.md)` | Guide to Vertical Slice Architecture (VSA) implementation in Beech CMS |
| `[release.md](release.md)` | Release script, versioning scheme, preview vs stable workflow |

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
│   ├── api/           # REST API (Hono + Cloudflare Workers/D1/R2) — Vertical Slice Architecture
│   └── dashboard/     # React frontend (Vite + Tailwind + Field Renderers) — Vertical Slice Architecture
├── packages/
│   └── core/          # @beechcms/core – Botanical Engine and shared types
├── docs/
│   ├── Sprints/       # Technical debt and sprint tracking
│   └── *.md           # Architectural documentation (architecture, api-reference, etc.)
├── package.json       # Root: workspaces, Turbo scripts
├── tsconfig.json      # Base TypeScript config
└── turbo.json         # Turbo pipeline (dev, build, test)
```

### `apps/api` – Cloudflare Workers API (VSA)

- **Main responsibilities**
  - Modularized by feature under `src/features/` (e.g., `content`, `auth`, `notifications`, `email`).
  - Auth routes (`/auth/login`, `/auth/refresh`, `/auth/logout`) — see `api-reference.md` §3.
  - Dynamic content routes (`/api/content/:slug`, `/api/content/:slug/facets`, `/api/content/:slug/:id`) — see `api-reference.md` §4.
  - Statistics and analytics endpoints (`/api/content/stats/total`, `/api/content/stats/cloudflare`, `/api/content/stats/storage/sync`).
  - Public routes (`/api/v1/public/health`, `/api/v1/public/:seed`, `/api/v1/public/:seed/add`, `/api/v1/public/:seed/edit/:id`) protected by API key — see `api-reference.md` §6.
  - Media upload and delivery (`/api/upload`, `/api/media/:key`) — see `api-reference.md` §5.
- **Key integrations**
  - Imports types and functions from `@beechcms/core` (`getSeed`, Botanical Engine).
  - Uses Cloudflare D1 for persistence (schema generated via `beech seed:load`).
  - Uses Cloudflare R2 for binary files.
- **Important files**
  - `apps/api/src/index.ts` — app entry, CORS, auth routes, analytics middleware.
  - `apps/api/src/features/content/` — universal CRUD content engine using Botanical Engine.
  - `apps/api/src/shared/` — cross-feature utilities and repository implementations.
  - `apps/api/src/middleware/` — Hono middlewares (auth, repository, rate-limiting, observability).

### `apps/dashboard` – Schema-driven React Dashboard

- **Main responsibilities**
  - Admin UI for managing content via the API.
  - Schema-driven rendering of forms, table, and gallery views via the FieldRenderers registry — see `frontend-guide.md` §2.
  - Filtering, sorting, searching, and view switching through `ContentToolbar` — see `frontend-guide.md` §7.
- **UI structure**
  - `apps/dashboard/src/features/content-toolbar/` — modular toolbar slice: view switching, filters, sorting, search, grouping, conditional formats. Strict named exports.
  - `apps/dashboard/src/features/content-gallery/` — gallery view slice (card grid + read-only peek panel). Strict named exports.
  - `apps/dashboard/src/features/fields/` — FieldRenderers registry slice (`FieldDisplay`, `FieldEdit`, `registry.ts`, `field-registry.ts`, `display/*.tsx`, `edit/*.tsx`). `registry.ts` holds a module-level `fieldRegistry: IFieldRegistry` singleton (Phase 5); `getDisplayComponent`/`getEditComponent` delegate to it. External plugins import `{ fieldRegistry }` from `registry.ts` and call `.registerDisplay/.registerEdit(...)` before mount.
  - `apps/dashboard/src/features/content-delete-dialog/` — deletion confirmation dialog slice. Strict named exports.
  - `apps/dashboard/src/features/auth/` — authentication domain slice containing the `login-form` component. Strict named exports.
  - `apps/dashboard/src/features/notifications/` — notifications slice containing the `notifications-popover` component. Strict named exports.
  - `apps/dashboard/src/features/navigation/` — navigation shell slice containing `app-sidebar` and `site-header` components. Named barrel export.
  - `apps/dashboard/src/features/richtext-editor/` — TipTap editor slice; only `index.ts` is importable from outside the slice.
  - `apps/dashboard/src/features/dashboard/` — Dashboard cockpit with bento grid widgets and Cloudflare Edge analytics. Sub-barrel `widgets.ts` isolates public widget components.
  - `apps/dashboard/src/features/widget-data/` — **Widget Data Layer**: typed hooks, formula evaluation, and Axios wrappers for the `/api/widget/*` endpoints. Public API via `index.ts`. See `frontend-guide.md` §8.
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
- **Barrel export**: `packages/core/src/index.ts` — types, seeds, engine, validation, richtext, slug utils, and the auth/rate-limit abstractions:
  - `IHashProvider` — password hashing contract (implemented by `BcryptHashProvider` in the API)
  - `ITokenService`, `JwtClaims`, `IssueTokenOptions` — JWT issuance/verification contract (implemented by `JoseTokenService`)
  - `IUserRepository`, `UserRecord`, `NewUserInput` — user persistence interface
  - `ISessionRepository`, `NewRefreshToken`, `RefreshTokenRecord`, `ActiveSessionSummary` — session persistence interface
  - `IPasswordResetTokenRepository`, `NewPasswordResetToken`, `ValidatedResetToken` — reset token persistence interface
  - `IRateLimiter`, `RateLimitResult` — rate limiting contract (implemented by `CloudflareRateLimiter` / `NoOpRateLimiter` / `InMemoryRateLimiter`)
  - **Phase 4 — cross-cutting utilities:**
    - `IClock` + `SystemClock` (`packages/core/src/clock.ts`) — wraps `Date.now()` and `Math.floor(Date.now() / 1000)`. Constructor-injected into `D1ActivityLogger`, `D1NotificationRepository`, `D1SessionRepository`, `D1AnalyticsRepository`, `JoseTokenService`. Test impl: `FixedClock` (`apps/api/src/shared/fixed-clock.ts`).
    - `IIdGenerator` + `SystemIdGenerator` (`packages/core/src/id-generator.ts`) — wraps `crypto.randomUUID()`. Injected into `D1ActivityLogger`, `D1NotificationRepository`, `D1PasswordResetTokenRepository`. Test impl: `SequentialIdGenerator` (`apps/api/src/shared/sequential-id-generator.ts`) emitting `test-id-NNNN`.
    - Both are NOT placed in `c.var`. They are constructor params of the concrete classes. Override hooks live on `repositoryMiddleware`, `authProvidersMiddleware`, and `observabilityMiddleware` (`{ clock?, idGenerator? }`).
  - **Phase 5 — seed and field registries:**
    - `ISeedRegistry` + `SeedRegistry` + `InMemorySeedRegistry` (`packages/core/src/seed-registry.ts`) — façade over the flat seed list. `c.var.seedRegistry` is now typed as `ISeedRegistry` (not `Record<string, Seed>`). Methods: `all()`, `get(slug)`, `visibleInDashboard()`, `publicReadable()`, `draftEnabled()`. `getSeed` in `c.var` continues to delegate to `seedRegistry.get()` for backwards compatibility. `SeedRegistry` is constructed in `createBeechApp` (both `apps/api` and `packages/api`).
    - `IFieldRegistry` + `FieldRegistryImpl` (`apps/dashboard/src/features/fields/field-registry.ts`) — plugin-extensible registry for field renderers. Module-level singleton `fieldRegistry` in `registry.ts` registers all built-in types at startup. External plugins call `fieldRegistry.registerDisplay/registerEdit(...)` before the app mounts. The public API (`getDisplayComponent`, `getEditComponent`) is unchanged for existing callers.
- **Build**: `npm run build -w @beechcms/core` produces `dist/` with JS and `.d.ts`, consumed by both apps.

---

## Key Flows

- **Authentication (`/auth/*`)** — see `api-reference.md` §2–3
  - Login: finds user via `IUserRepository.findByEmail`, verifies password via `IHashProvider.verify` (bcrypt under the hood), issues JWT via `ITokenService.issue` (jose under the hood, 15 min TTL), stores refresh token hash via `ISessionRepository.saveRefreshToken`, sets `HttpOnly SameSite=Strict` cookie.
  - Refresh: reads cookie, validates via `ISessionRepository.findActiveByHash`, revokes old token, issues new access + refresh token pair.
  - Logout: revokes refresh token via `ISessionRepository.revokeByHash`, clears cookie, clears in-memory token on the client.
  - `IHashProvider`, `ITokenService`, `IUserRepository`, `ISessionRepository`, and `IPasswordResetTokenRepository` are injected into the Hono context via `authProvidersMiddleware` and `repositoryMiddleware` respectively. Concrete implementations live in `apps/api/src/auth/` and `apps/api/src/shared/`. Rate limiting uses `IRateLimiterRegistry` (injected via `rateLimiterMiddleware`), backed by `CloudflareRateLimiter` in production and `NoOpRateLimiter` when bindings are absent.
  - **Access token storage:** the JWT access token lives **in-memory only** (`_accessToken` module variable in `apps/dashboard/src/lib/api.ts`). It is never written to `localStorage` or `sessionStorage`. On page load, `AuthProvider` silently calls `POST /auth/refresh`; if the `HttpOnly` refresh cookie is valid, a new access token is issued and stored in memory. This eliminates the XSS → token-theft attack surface.
  - **AuthContext** (`apps/dashboard/src/lib/auth-context.tsx`): `AuthProvider` mounts at app root and manages `{ status: 'loading' | 'authenticated' | 'unauthenticated', user }`. `useAuth()` is the hook for all components. `ProtectedRoute` renders `<SplashScreen />` during the initial refresh, then either the protected content or `<Navigate to="/login">`.
  - **Password reset (optional):** enabled only when `RESEND_API_KEY` is set. `GET /auth/features` exposes the flag to the dashboard. `POST /auth/forgot-password` issues a 30-min single-use token (SHA-256 hashed in `password_reset_tokens`) and sends the reset link via Resend (rate-limited: 3/min per IP via `FORGOT_PASSWORD_RATE_LIMITER`). `POST /auth/reset-password` validates the token, updates `password_hash`, marks it used, and revokes all active sessions — atomically via `D1.batch()` — then fires a **"password changed" security notification email** via `waitUntil` (rate-limited: 5/min per IP via `RESET_PASSWORD_RATE_LIMITER`). Both endpoints accept a `locale` field (`en` | `it`) that selects the email language; the dashboard passes `i18n.language` automatically. `APP_URL` must point to the dashboard URL.

- **Content CRUD (`/api/content/:slug`)**
  - **Write (POST/PUT):** payload is validated and serialized into dedicated table columns via Botanical Engine.
  - **Read (GET):** retrieves rows from `content_{slug}`, deserializes complex types, and returns JSON response.
  - Supports server-side pagination, filtering, sorting, and search (via B-tree and FTS5).
  - **Facets (`GET /api/content/:slug/facets`):** computes distinct `status` values and tag sets.

- **Global Search (`/api/search`)**
  - Route handler in `apps/api/src/search.ts` parses query params and calls `c.get('searchRepository').search(...)` and `.count(...)` in parallel. All FTS5 SQL composition is delegated to the pure helper `buildFtsQuery` consumed by `D1SearchRepository`. `mapSearchResultRow` strips HTML while preserving `<mark>` tags for the excerpt field.

- **Media Engine (`/api/upload`, `/api/media/:key`)** — see `architecture.md` §11
  - Upload: `POST /api/upload` multipart → validate MIME/size → `BeechBucket.put` (R2/S3) → `MediaRepository.trackUpload` + `SystemStatsRepository.incrementStorage` → return URL.
  - Serve: `GET /api/media/:key` proxies via `BeechBucket.get` (R2/S3) with `Cache-Control: public, max-age=31536000, immutable`. Public route, no auth required.
  - Cascade delete: `DELETE /api/content/:slug/:id` extracts keys from fields → `BeechBucket.delete` + `MediaRepository.deleteObject` + `SystemStatsRepository.decrementStorage`.

- **Public API (`/api/v1/public/*`)** — see `api-reference.md` §6
  - Three-level permission model: seed capability flags (`allowPublicRead/Post/Edit`) + split API keys (`PUBLIC_READ_API_KEY` / `PUBLIC_WRITE_API_KEY`) + published-only filter (`PUBLIC_PUBLISHED_ONLY`).
  - Read endpoint: id lookup, filters, search, pagination, `latest`, field projections. Response è **flat** — content fields at the same level as `id`, `slug`, `status`.
  - **Worker Cache API**: le GET su `/api/v1/public/:seed` vengono messe in cache con TTL 60 secondi via `caches.default` e `waitUntil`. Zero query D1 su cache hit.
  - Write endpoints: fail-closed validation, slug uniqueness, idempotency via `Idempotency-Key`, prepared statements.
  - Dedicated rate limiters: `PUBLIC_READ_RATE_LIMITER`, `PUBLIC_WRITE_RATE_LIMITER`.
  - All errors: RFC 7807 Problem Details (`application/problem+json`).

- **Dashboard Rendering (schema-driven)** — see `frontend-guide.md`
  - `EntryEditorPage` loads the Seed and renders each `Branch` via `<FieldEdit branch={branch} ... />`. No hardcoded field lists.
  - Field type is resolved by `registry.ts` — no `switch(branch.type)` in page code.
  - Table columns are generated dynamically from `Seed.branches` and rendered with `<FieldDisplay>`.
  - Gallery card slots (cover, title, excerpt, date, tags) are resolved by `resolveCardFields` heuristics from the Seed — no fetch beyond the shared dataset.
  - `ContentToolbar` drives filters, sort, search, grouping, and view switching. Filter columns are derived from `Seed.branches` at runtime via `useToolbarFilters`.

- **Widget Data Layer (`/api/widget/*`)**
  - Five JWT-protected read-only endpoints: `aggregate`, `growth`, `leaderboard`, `list`, `timeseries`.
  - Server side (`apps/api/src/widget.ts`): route handlers parse query strings and shape responses; all D1 access flows through `IWidgetRepository` (Phase 3). Concrete `D1WidgetRepository` in `apps/api/src/shared/d1-widget.repository.ts` validates column aliases against `seed.branches` before SQL composition and uses `?` placeholders for every user-supplied value.
  - Client side (`apps/dashboard/src/features/widget-data/`): TanStack Query hooks.

- **Edge Analytics & Stats**
  - **Request Tracking**: middleware in `apps/api/src/factory.ts` invokes `c.get('analyticsRepository').recordRequest(seedSlug)` inside `c.executionCtx.waitUntil` (zero-latency). La tabella `analytics(day_ts, metric, seed, value)` ha una colonna `seed` (stringa vuota = globale, `'articoli'` = per-seed). `IAnalyticsRepository` (Phase 3) è l'unico canale per leggere/scrivere counters; `D1AnalyticsRepository` è in `apps/api/src/shared/`. Phase 4: il day-bucket viene calcolato internamente da `D1AnalyticsRepository` tramite l'`IClock` iniettato — la middleware non passa più un timestamp.
  - **Storage Monitoring**: `system_stats` counter incremented on upload, decremented on delete, resyncable via `POST /api/content/stats/storage/sync`. La fonte canonica per la media library è `media_objects` (`SUM(size_bytes)`).
  - **Cockpit Dashboard**: bento grid widgets for total contents, visitors, requests, and R2 storage — driven by TanStack Query with 5-minute `staleTime`.

- **Observability & Notifications** — see `observability-and-notifications.md`
  - Handlers use `context.get('activityLogger').log(...)` for auditing (async, fire-and-forget).
  - Handlers use `context.get('notificationService').notify(...)` for system alerts.
  - Abstractions (`IClock`, `IIdGenerator`) ensure testability without global state patching.

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
  - **Must** store the access token **in-memory only** (`_accessToken` in `api.ts`). Never write it to `localStorage`, `sessionStorage`, or cookies from the client.
  - **Must** use `useAuth()` from `apps/dashboard/src/lib/auth-context.tsx` for auth state and user info in components. Never read `localStorage` for token presence checks.
  - **Must not** store tokens in plaintext or introduce undocumented session mechanisms.
  - **Must** inject security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) on all `/admin/*` responses by wrapping the immutable ASSETS `Response` — the middleware approach does not work for static asset responses.
  - **Must not** use `dangerouslySetInnerHTML` with content derived from the FTS `snippet()` function or any richtext field. Strip HTML and preserve only `<mark>` tags before rendering search excerpts.

- **UI schema-driven & FieldRenderers**
  - **Must** use `FieldDisplay`/`FieldEdit` and the registry in `apps/dashboard/src/features/fields/` for all field rendering.
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
  - **Must not** introduce new state-management, routing, or UI libraries without updating `SYSTEM_MAP.md` and the relevant docs in `docs/`.

---

## Document Maintenance

- **Update the stack** whenever a core technology changes (new framework, DB, CI/CD tool).
- **Update folder architecture** when adding new apps in `apps/` or new packages in `packages/`.
- **Update non-negotiable conventions** when making major architectural decisions.
- **Update `docs/`** when APIs, field types, or frontend patterns change — `SYSTEM_MAP.md` links there and does not duplicate content.

`SYSTEM_MAP.md` is the high-level source of truth for understanding **how Beech CMS is built**. Implementation details are in the `docs/` directory and in the codebase itself.
