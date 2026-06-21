<architecture_rules>
# Beech CMS - AI Architectural Prompt

You are assisting with the Beech CMS codebase. You MUST strictly adhere to the following architectural rules and constraints:

## 1. Monorepo & Dependencies
- **Topology**: pnpm workspaces with `apps/api` (Hono on CF Workers), `apps/dashboard` (React+Vite SPA), and `packages/core`.
- **CONSTRAINT**: `@beechcms/core` is the Single Source of Truth (types, validation, engine). It MUST NEVER import from `apps/*`.
- **CONSTRAINT**: Apps are pure consumers of `core`. All business logic touching schema, validation, or translation belongs in `core`.

## 2. API Architecture (Vertical Slice Architecture)
- **Topology**: Features live in `apps/api/src/features/<feature_name>`.
- **CONSTRAINT**: Features MUST NEVER import from other features.
- **CONSTRAINT**: Handlers must remain "thin". They only: parse/validate request -> get Repository from Hono context -> call Repository -> handle specific errors -> return HTTP response.

## 3. Database & Repository Pattern
- **Database**: Cloudflare D1 (SQLite at the Edge). Data is stored in per-type tables (`content_{slug}`) using native SQLite types (no JSON blobs).
- **CONSTRAINT**: NEVER write direct SQL (`c.env.DB.prepare`) in handlers, features, widget logic, search logic, or analytics logic.
- **CONSTRAINT**: All database and external operations MUST be routed through Repositories/Interfaces defined in `@beechcms/core` (e.g. `ContentRepository`, `IWidgetRepository`, `ISearchRepository`, `IAnalyticsRepository`).
- **CONSTRAINT**: Repositories are injected via middleware and retrieved from the context (e.g., `c.get('repository')`).

## 4. External Services & Providers
- **Storage**: Abstracted via `BeechBucket`.
  - **CONSTRAINT**: The API Worker MUST NEVER receive file bytes directly. All uploads must use presigned URLs directly from client to storage.
- **Auth & Rate Limiting**: Abstracted via `IHashProvider`, `ITokenService`, `IRateLimiter`.
  - **CONSTRAINT**: External libraries (`bcryptjs`, `jose`, CF RateLimit binding) MUST be isolated to their single respective implementation file.

## 5. System Workflows & Patterns
- **Drafts**: Uses a Mirror Table strategy (`content_{slug}_drafts`).
  - **CONSTRAINT**: Live tables (`content_{slug}`) are NEVER modified by draft endpoints. Promotion is an atomic `INSERT ... SELECT`.
- **Time & Identifiers**: 
  - **CONSTRAINT**: NEVER use `Date.now()` or `crypto.randomUUID()` directly in repositories or services. Always use constructor-injected `IClock` and `IIdGenerator` for deterministic testing.
- **Side Effects (Automations)**:
  - **CONSTRAINT**: Handlers MUST NOT perform synchronous side-effects (e.g. emails, webhooks). Trigger them asynchronously via `c.get('automationRunner').run()` wrapped in `c.get('scheduler').waitUntil()`.
- **Schema Management**: Seeds are DB-resident. Schema mutations (DDL) are calculated by `planSeedDdl` and applied via `ISchemaMutator`.

## 6. Testing
- **Integration**: Uses real services via Docker (MinIO, Mailpit, webhook-tester). NO external mocks.
- **Database**: Uses `D1TestDatabase` (better-sqlite3 in-memory) for exact D1/FTS5 emulation.
</architecture_rules>
