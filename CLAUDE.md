# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Root (runs all packages via Turborepo)
```bash
npm run dev        # Start API + Dashboard in parallel
npm run build      # Build all packages
npm run test       # Run all tests
```

### API (`apps/api`)
```bash
npm run dev                  # wrangler dev --port 8789
npm run test                 # vitest run
npm run test -- --reporter=verbose  # single test file: vitest run src/test/foo.test.ts
npm run db:migrate:local     # apply D1 migrations locally
npm run db:reset:local       # wipe .wrangler state + re-migrate
npm run deploy               # wrangler deploy --minify (production)
npm run cf-typegen           # regenerate Cloudflare binding types
```

### Dashboard (`apps/dashboard`)
```bash
npm run dev      # vite (port 5173, proxies /api and /auth to port 8789)
npm run build    # tsc -b && vite build
npm run lint     # eslint .
npm run test     # vitest run
```

### Core package (`packages/core`)
```bash
npm run build    # tsc (compiles to dist/)
npm run dev      # tsc -w (watch mode — required before API/Dashboard can import @beech/core)
npm run lint     # eslint .
```

## Architecture

BeechCMS is a monorepo (Turborepo + npm workspaces) structured as three tiers:

```
packages/core  →  apps/api  →  apps/dashboard
```

### packages/core (`@beech/core`)

The single source of truth for all content schema knowledge. Key modules:

- **`engine.ts`** — The **Botanical Engine**: `apiToDb()` and `dbToApi()` translate between human-readable field aliases and immutable database IDs (`br_01`, `br_02`, …). This is the key invariant: field aliases can change; branch IDs never can.
- **`seeds.ts`** — `SEED_REGISTRY` defines every content type (Articoli, Prodotti, Team, Testimonianze, Pagine). A `Seed` is an array of `Branch` objects, each with an `id` (immutable DB key) and `alias` (mutable API name).
- **`types.ts`** — Core interfaces: `Seed`, `Branch`, `DbPayload`, `ApiPayload`.
- **`validation.ts`** — Zod-based `validateAndSanitizeSeedPayload()`, called by the API before every write.
- **`richtext.ts`** / **`richtext-render.ts`** — TipTap document envelope format and HTML renderer.

### apps/api (Hono on Cloudflare Workers)

Edge-deployed REST API backed by Cloudflare D1 (SQLite), R2 (object storage), and rate limiters.

- **`index.ts`** — Hono app root: registers security headers, CORS, auth routes (`/auth/*`), and the content router.
- **`content.ts`** — Universal CRUD engine. Every content type shares the same handler; the seed name in the URL determines the schema. Reads from D1, calls `dbToApi` on output, calls `apiToDb` on input.
- **`middleware.ts`** — JWT auth guard (`jose`). Short-lived access tokens + refresh tokens.
- **`public/`** — Unauthenticated public read/write routes (API-key protected), rate limited.
- **`shared/`** — Query builder helpers, R2 storage utils, activity logger.
- **`migrations/`** — Numbered SQL migration files applied via `db:migrate:local` / wrangler in production. All content lives in a single `content_entries` table with a JSON `data` column storing Botanical IDs.

All error responses follow RFC 7807 (`application/problem+json`).

### apps/dashboard (React + Vite SPA)

Admin UI organized as vertical feature slices under `src/features/`:

- **`content-management/`** — `useContentList`, `useContentFacets` hooks; API call layer via Axios (`src/lib/api.ts`).
- **`richtext-editor/`** — TipTap v3 editor with custom extensions (math/KaTeX, custom marks).
- **`dashboard/`** — Stats widgets, activity log, system health.
- **`command-palette/`** — Global keyboard-driven command palette.

Pages in `src/pages/`: `content-list.tsx` (table/gallery view), `entry-editor.tsx` (create/edit form).

Field rendering is split: `src/components/fields/` contains `FieldDisplay` (read) and `FieldEdit` (write) components, one per field type, driven by the seed schema.

`vite.config.ts` proxies `/api` and `/auth` to `http://127.0.0.1:8789` during development — start Wrangler dev first.

## Key Patterns

**Botanical Engine invariant:** Never store or compare field names against D1 directly. Always go through `apiToDb`/`dbToApi` from `@beech/core`. Branch IDs (`br_XX`) are the only stable DB keys.

**Adding a new content type:** Define a new `Seed` in `packages/core/src/seeds.ts`, add it to `SEED_REGISTRY`, rebuild `@beech/core`. The API and dashboard dynamically derive everything else from the registry.

**Adding a new field type:** Add a `Branch` to the relevant seed with a new `br_XX` id, add a case to the field renderer components in `apps/dashboard/src/components/fields/`, and add Zod validation in `packages/core/src/validation.ts`.

**D1 migrations:** Every schema change needs a numbered SQL file in `apps/api/migrations/`. Run `npm run db:migrate:local` to apply locally. The `content_entries` table stores all content types; the seed name is a column used to filter.

## Tech Stack Summary

| Concern | Technology |
|---|---|
| Edge runtime | Cloudflare Workers |
| API framework | Hono v4 |
| Database | Cloudflare D1 (SQLite / FTS5) |
| Object storage | Cloudflare R2 |
| Auth | `jose` JWT + `bcryptjs` |
| Frontend | React 19 + Vite 7 |
| Server state | TanStack Query v5 |
| UI | Shadcn/ui + Tailwind CSS v4 |
| Tables | TanStack Table v8 |
| Rich text | TipTap v3 + KaTeX |
| Validation | Zod v4 |
| Testing | Vitest v3 + @testing-library |
| Build orchestration | Turborepo v2 |
