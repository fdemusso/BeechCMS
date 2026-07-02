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
| `[architecture.md](architecture.md)` | Monorepo topology, Turborepo pipeline, `@beechcms/core` barrel, Botanical Engine (Schema Compiler), Per-type SQL model, VSA migration, abstraction phases 1–7 (repositories, auth, analytics, clock/id, seed registry, automation engine, scheduler) |
| `[api-reference.md](api-reference.md)` | Auth, Internal Content API, Media Engine, Public API, Widget API, Automations CRUD API |
| `[frontend-guide.md](frontend-guide.md)` | FieldRenderers, TanStack Query, Tailwind 4, EntryEditorPage, ContentToolbar |
| `[email-module.md](email-module.md)` | Email module architecture, localization, templates |
| `[observability-and-notifications.md](observability-and-notifications.md)` | Abstractions for logging, notifications, and cross-cutting utilities (Clock/IdGenerator) |
| `[vertical-slice.md](vertical-slice.md)` | Guide to Vertical Slice Architecture (VSA) implementation in Beech CMS |
| `[release.md](release.md)` | Release script, versioning scheme, preview vs stable workflow |
| `[automations.md](automations.md)` | Automation guide, setting variables, and template grammar |
| `[custom-widgets.md](custom-widgets.md)` | `@beechcms/widget-sdk` contract for authoring custom dashboard widgets |

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
    - `agentation`: `^3.0.2` (visual feedback toolbar — development tool)
  - **Internationalisation (i18n)**
    - `i18next` `^26.0.6`, `react-i18next` `^17.0.4`, `i18next-browser-languagedetector` `^8.2.1`
    - Setup: `apps/dashboard/src/lib/i18n.ts` — initialized before render via `import '@/lib/i18n'` in `main.tsx`.
    - Supported languages: `en` (default), `it`. Dictionaries at `apps/dashboard/src/locales/{en,it}.json` (namespaced: `common`, `dashboard`, `editor`, `settings`).
    - Language preference persisted in `localStorage` under key `beech_language` (same key read by `interface-tab.tsx`). Changing language in Settings → Interfaccia applies **immediately** via `i18n.changeLanguage()`.
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
@beechcms/cms/
├── apps/
│   ├── api/           # REST API (Hono + Cloudflare Workers/D1/R2) — Vertical Slice Architecture
│   └── dashboard/     # React frontend (Vite + Tailwind + Field Renderers) — Vertical Slice Architecture
├── packages/
│   ├── cli/           # @beechcms/cli – Unified Developer Tooling and command handlers
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
  - Automation CRUD routes (`/api/automations`, `/api/automations/:id`, `/api/automations/:id/toggle`) — see `api-reference.md` §10.
- **Key integrations**
  - Imports types and functions from `@beechcms/core` (`getSeed`, Botanical Engine).
  - Uses Cloudflare D1 for persistence (schema hydrated dynamically at runtime from the `seeds` table; bootstrapped via `beech onboard` or `beech seed:load`).
  - Uses Cloudflare R2 for binary files.
- **Important files**
  - `apps/api/src/index.ts` — app entry, CORS, auth routes, analytics middleware, `scheduled` handler for cron automations.
  - `apps/api/src/features/content/` — universal CRUD content engine using Botanical Engine.
  - `apps/api/src/features/automations/` — automation CRUD handler, `AutomationRunner`, `CronRunner`, and four action executors (`webhook`, `send_mail`, `edit_field`, `create_entry`).
  - `apps/api/src/features/backrefs/` — back-references API: given a target entry, returns all entries across seeds that reference it via `relation` branches. Uses `D1BackrefRepository` backed by `buildBackrefMap` from `@beechcms/core`.
  - `apps/api/src/features/schema/` — exposes compiled seed schema to authenticated dashboard consumers.
  - `apps/api/src/features/settings/` — site-wide settings CRUD (title, language, timezone, etc.) backed by `ISiteSettingsRepository`.
  - `apps/api/src/features/setup/` — first-run setup wizard endpoint.
  - `apps/api/src/features/rotate-field/` — regenerates a single field value (e.g. slug) for an existing entry without a full update.
  - `apps/api/src/features/webhooks/` — inbound webhook receiver (e.g. for QStash callbacks).
  - `apps/api/src/features/password-reset/` — password reset flow (extracted from `auth`).
  - `apps/api/src/shared/` — cross-feature utilities and repository implementations.
  - `apps/api/src/shared/qstash-notification-service.ts` — `QStashNotificationService`: dispatches background notifications via Upstash QStash; injectable as `INotificationService`.
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
  - `apps/dashboard/src/features/automations/` — Automations UI slice: `AutomationPanel` (list + toggle), `AutomationEditor` (trigger + conditions + actions), and typed API wrappers via `automations.api.ts`. Public API via `index.ts`.
  - `apps/dashboard/src/features/entry-editor/` — Entry editor slice (replaces the deleted `src/pages/entry-editor.tsx`). Exports: `EntryEditorDialog` (modal create/edit form), `LayoutRenderer` (renders a `FormLayout` into a tabbed/sectioned field grid), `LayoutBuilderDialog` (drag-and-drop layout builder — powered by `@dnd-kit`). Public API via `index.ts`.
  - `apps/dashboard/src/features/backrefs/` — Back-references slice: `ReferencedByPanel` (shows which entries link to the current one), `DeleteButtonWithRestrict` (blocks deletion when back-references exist), `useBackrefs` / `useBackrefsGroup` hooks, `backrefsApi`. Public API via `index.ts`.
  - `apps/dashboard/src/features/bulk-edit/` — `BulkEditDialog`: allows editing a shared field across multiple selected entries in one operation. Public API via `index.ts`.
  - `apps/dashboard/src/features/drafts/` — Global drafts slice: `useGlobalDrafts` hook, `DraftSummary` type, `drafts.api.ts`. Used by the `DraftsListPage` and sidebar badge. Public API via `index.ts`.
  - `apps/dashboard/src/features/schema/` — `useSchema` hook: fetches compiled seed schema from `/api/schema`. Used internally by features that need runtime branch metadata. Public API via `index.ts`.
  - `apps/dashboard/src/features/settings/` — Settings page slice: tabbed UI (General, Interface, Notifications, Profile, Security, Storage). `useSettings` and `useGeneralTab` hooks. Integrates with `ISiteSettingsRepository` via API. Public API via `index.ts`.
  - `apps/dashboard/src/features/shared/` — Cross-feature shared utilities (components, hooks, helpers) that serve more than one slice but are not general enough for `src/components/ui` or `src/lib`.
  - Entry editor is now a dialog (`EntryEditorDialog` from `entry-editor` slice); the standalone page `src/pages/entry-editor.tsx` has been removed.
  - New pages: `src/pages/drafts-list.tsx` (`DraftsListPage`), `src/pages/scheduled.tsx` (`ScheduledPage`), `src/pages/create-new.tsx` (`CreateNewPage`), `src/pages/widget-lab.tsx` (`WidgetLabPage`).
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
    - `ISeedRegistry` + `SeedRegistry` + `InMemorySeedRegistry` (`packages/core/src/seed-registry.ts`) — façade over the seed registry. In production, this registry is hydrated dynamically from D1 per request, caching it locally in the isolate based on `seed_meta.registry_version`. Methods: `all()`, `get(slug)`, `visibleInDashboard()`, `publicReadable()`, `draftEnabled()`. `getSeed` in `c.var` continues to delegate to `seedRegistry.get()` for backwards compatibility. `SeedRegistry` is constructed in `createBeechApp` (both `apps/api` and `packages/api`).
    - `IFieldRegistry` + `FieldRegistryImpl` (`apps/dashboard/src/features/fields/field-registry.ts`) — plugin-extensible registry for field renderers. Module-level singleton `fieldRegistry` in `registry.ts` registers all built-in types at startup. External plugins call `fieldRegistry.registerDisplay/registerEdit(...)` before the app mounts. The public API (`getDisplayComponent`, `getEditComponent`) is unchanged for existing callers.
  - **Phase 6 — Automation Engine:**
    - `AutomationTriggerEvent` — `'create' | 'update' | 'delete' | 'cron'`
    - `AutomationAction` — discriminated union: `webhook`, `send_mail`, `edit_field`, `create_entry`
    - `TriggerCondition` — `{ field, op, value }` where `op` is one of `eq | neq | contains | gt | lt | isempty | isnotempty`
    - `Automation` — full entity type (id, seed_slug, name, enabled, trigger_event, trigger_cron, trigger_conditions, actions, timestamps)
    - `IAutomationRepository` (`packages/core/src/automations.repository.interface.ts`) — `list`, `findById`, `create`, `update`, `toggle`, `delete`, `findActive`
    - `IAutomationRunner` + `AutomationEventPayload` (`packages/core/src/automations.runner.interface.ts`) — single `run(payload)` method
    - `NoOpAutomationRunner` (`packages/core/src/automations.runner.stub.ts`) — used in tests and as a safe default before the real runner is wired
    - `IContentScanRepository` (`packages/core/src/content-scan.repository.ts`) — `getReferencedMediaKeys(seeds)` for orphaned-media detection across all seeds
  - **Phase 7 — Scheduler abstraction:**
    - `IScheduler` (`packages/core/src/scheduler.interface.ts`) — `waitUntil(promise)` contract; decouples Cloudflare `ExecutionContext` from handlers
    - `NoOpScheduler` (`packages/core/src/scheduler.stub.ts`) — test/non-CF environments
    - `ExecutionContextScheduler` (`apps/api/src/shared/execution-context-scheduler.ts`) — production implementation wrapping `context.executionCtx.waitUntil`
  - **Phase 8 — Form Layout System:**
    - `FormLayout`, `LayoutTab`, `LayoutSection`, `LayoutColumn`, `LayoutField` (`packages/core/src/seed-layout.ts`) — typed drag-and-drop form layout model. Layouts are per-Seed, stored in D1 via `ISeedLayoutRepository`. `generateDefaultLayout(seed)` produces a default single-tab layout from the seed's branches. `validateLayoutAgainstSeed` strips orphaned `branchId` references on read. `isFullWidthBranch`, `isGalleryBranch`, `isSeoBranch` helpers classify branch types for layout constraints.
    - `ISeedLayoutRepository` (`packages/core/src/seed-layout.repository.ts`) — `getLayout(seedSlug)`, `saveLayout(seedSlug, layout)`.
    - `layout-permissions.ts` — permission helpers for who can read/write layouts.
  - **Back-references:**
    - `buildBackrefMap(seeds)` + `BackrefSource` + `BackrefMap` (`packages/core/src/relations.ts`) — pure function that scans `SEED_REGISTRY` for `relation` branches and builds a `targetSlug → sources[]` lookup. Built once in `factory.ts` and cached for the process lifetime.
  - **Site Settings:**
    - `SiteSettings` + `ISiteSettingsRepository` (`packages/core/src/site-settings.repository.ts`) — contract for reading/writing site-wide settings (title, language, timezone, currency, company info).
  - **Demo Data:**
    - `IDemoDataRepository` (`packages/core/src/demo-data.repository.ts`) — contract for seeding and clearing demo content.
  - **Webhook validation:**
    - `webhook-validation.ts` — helpers for validating inbound webhook signatures (used by the `webhooks` feature in the API).
- **Build**: `pnpm --filter @beechcms/core` and `pnpm --filter @beechcms/widget-sdk` produce `dist/` with JS and `.d.ts`, consumed by the apps.

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
  - **Automation trigger:** after each successful `create`, `update`, or `delete`, the handler fires automations asynchronously: `c.get('scheduler').waitUntil(c.get('automationRunner').run({ seedSlug, event, entry }))`. The `IScheduler` wrapper ensures the operation completes even after the HTTP response is sent.

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

- **Automation Engine (`/api/automations/*`)** — see `api-reference.md` §10
  - CRUD: `GET /api/automations?seed=<slug>`, `POST /api/automations`, `GET /api/automations/:id`, `PUT /api/automations/:id`, `PATCH /api/automations/:id/toggle`, `DELETE /api/automations/:id`. All JWT-protected. Validation via Zod (`automations.schema.ts`).
  - **Runtime execution:** content handlers (`create`, `update`, `delete`) call `c.get('scheduler').waitUntil(c.get('automationRunner').run({ seedSlug, event, entry }))` after a successful write. `AutomationRunner` queries `IAutomationRepository.findActive(seedSlug, event)`, evaluates `TriggerCondition[]` via `evaluateConditions`, then dispatches each `AutomationAction` to the matching executor.
  - **Action executors** (`apps/api/src/features/automations/action-executors/`):
    - `webhook` — HTTP call to `action.url` with optional template interpolation of `{{field}}` placeholders from the entry payload.
    - `send_mail` — calls the shared `sendAutomationMail` helper (Resend REST API); requires `EMAIL_API_KEY` or `RESEND_API_KEY` in env.
    - `edit_field` — updates a single field on the triggering entry via `ContentRepository`.
    - `create_entry` — creates a new entry in a (potentially different) seed, mapping fields via `action.field_map`.
  - **Cron automations:** the Cloudflare Workers `scheduled` event handler in `apps/api/src/index.ts` calls `runCronAutomations(deps, event.scheduledTime)`. `CronRunner` fetches all enabled `trigger_event='cron'` automations via `findActive('*', 'cron')`, matches `trigger_cron` against the current time using `cronMatches`, then fetches matching entries via `ContentRepository.findMany` (applying `trigger_conditions` as filters), and dispatches each through `IAutomationRunner.run`.
  - **Injection:** `IAutomationRepository` (→ `D1AutomationRepository`) and `IAutomationRunner` (→ `AutomationRunner`) are injected by `repositoryMiddleware`. Both are overridable in tests via the `overrides` parameter.

---

## Non-Negotiable Conventions

- **Schema-driven everywhere**
  - **Must** use the Botanical Engine for all database interactions.
  - **Must** declare `displayNameAlias` on every `Seed`.
  - **Branch policies** must be enforced via `resolvePolicies`.
  - **Pending drafts** are opt-in: set `allowDrafts: true` on the Seed to enable the `/draft` endpoint family. Uses mirror tables `content_{slug}_drafts`.
  - **Must** treat the D1 database (`seeds` table) as the single source of truth for content types. Running workers load definitions dynamically; `seed.ts` is only a bootstrapping tool.
  - **Must** perform destructive operations only via the authorized admin API routes (`/api/seeds/...`) and after explicit confirmation checks.

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

- **Automation Engine**
  - **Must** fire automations from content handlers via `c.get('scheduler').waitUntil(c.get('automationRunner').run(...))` — never call `AutomationRunner` directly from a handler.
  - **Must not** import concrete implementations (`AutomationRunner`, `D1AutomationRepository`) from inside automation feature handlers — only interact through the `IAutomationRunner` and `IAutomationRepository` interfaces on `c.var`.
  - **Must** declare automation contracts (types, interfaces, stubs) in `@beechcms/core`; never import from `apps/api/src/features/automations/` in content handlers.
  - **Must** use `IScheduler` (injected as `c.get('scheduler')`) for any operation that must outlive the HTTP response — never call `c.executionCtx.waitUntil(...)` directly in handlers.

- **Form Layouts**
  - **Must** use `ISeedLayoutRepository` (injected via middleware) for all layout persistence — never query the layout table directly.
  - **Must** call `validateLayoutAgainstSeed(layout, seed)` before rendering a stored layout; orphaned `branchId` references are stripped automatically.
  - **Must** use `generateDefaultLayout(seed)` when no persisted layout exists — never construct a `FormLayout` object manually in handlers or components.

- **Back-references**
  - **Must** use `buildBackrefMap` (called once at factory init) and inject the resulting `BackrefMap` into the Hono context — never re-scan seeds per request.
  - **Must** expose back-reference data exclusively through the `backrefs` API feature and the `backrefsApi` client — never query relation branches directly in components.
  - **Must** use `DeleteButtonWithRestrict` from `features/backrefs/` instead of a plain delete button for any entry that could have inbound relations.

- **Entry Editor**
  - **Must** use `EntryEditorDialog` from `features/entry-editor/` for all create/edit flows — the standalone `EntryEditorPage` has been removed.
  - **Must** use `LayoutRenderer` to render fields inside a dialog/panel — never iterate `seed.branches` directly in the editor UI.
  - **Must** use `LayoutBuilderDialog` to expose layout customization — never build layout-editing UI ad hoc in other slices.

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
