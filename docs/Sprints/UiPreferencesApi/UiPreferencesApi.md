# Sprint Plan — UiPreferencesApi (BeechPal sprint 8 of 9)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md`, entry 8.
Feature brief: `stages/00_ideation/output/feature_brief.md`, rule 11 ("closed keys, validated server side,
with a maximum size; this feature writes only the pins key"), rule 12 (pins persisted per user, server
side) and §4 *Pin e preferenze utente*.
Previous sprints shipped (archives in `docs/Sprints/`): `BeechPalProviderEngine`, `BeechPalLocalTools`,
`SearchResultMetadataApi`, `BeechPalContentSearch`, `BeechPalRowActions`, `BeechPalQuickNotes`,
`BeechPalContextActions`, `BeechPalSystemCommands`, `BeechPalRecentItems`. Only `SearchResultMetadataApi`
touched the API; it took migration `0043`. Every other sprint was dashboard-only, so the settings slice,
`IUserRepository` and the `users` table are exactly as they were before the feature started.

---

### Pre-Computation Analysis

Graph rebuilt first with `graphify update . --force` → 30324 nodes, 44589 edges, 2959 communities.

**a) God nodes on the path (via `graphify explain`)**

| Node | Source | Degree | Role here |
|------|--------|--------|-----------|
| `D1UserRepository` | `apps/api/src/shared/db/repositories/d1-user.repository.ts:L53` | 19 | The only `IUserRepository` implementation. Gains two methods. Imported by `repository.middleware.ts`, `d1-last-global-admin.test.ts`, `d1-user.repository.test.ts`. |
| `settingsApp` | `apps/api/src/features/settings/settings.handler.ts:L86` | hub | The settings slice router, mounted at `routes.ts:L64` (`.route('/settings', settingsApp)`). Gains two routes. |
| `PROTECTED_ROUTES` | `apps/api/src/middleware/permission.middleware.ts:L69` | hub | Fail-closed route table. Gains two rows; its completeness test (`permission.middleware.test.ts:L14`) fails for any unmapped mounted route. |
| `IUserRepository` | `packages/core/src/auth/user.repository.ts:L53` | 1 (type-only) | The contract. The graph sees no type-use edges, so implementers and doubles were listed by grep (below). |
| `repositoryMiddleware` | `apps/api/src/middleware/repository.middleware.ts` | hub | Already sets `userRepository` on every request. No edit. |

`IUserRepository` doubles found by grep (each must keep compiling, because `apps/api/tsconfig.json` has
no `include`, so test files are type-checked too):
- `apps/api/src/features/rbac/invitations.public.test.ts:L48-63`: a **full** object of typed `vi.fn`s passed
  to `context.set('userRepository', users)` (L92) **without** a cast. It breaks at compile time when the
  interface gains a method. Handled in Task 6.
- `apps/api/src/features/rbac/users.get.test.ts:L33` and `apps/api/src/auth/auth.app.test.ts:L44`: cast
  `as unknown as IUserRepository`. Unaffected.
- `apps/api/src/features/settings/settings.handler.test.ts:L13`: `buildApp(mocks: any)`. Unaffected.

**b) Architectural boundaries affected**

- `@beechcms/core`:
  - New `packages/core/src/settings/ui-preferences.ts`: the closed-key zod schema, its caps and a
    tolerant reader. Core already depends on `zod` (`packages/core/package.json:L60`) and already exports
    zod schemas (`dashboard-layout/content-view.ts:L33`), so no new dependency.
  - `packages/core/src/index.ts`: one star-export next to `settings/site-settings.repository.js` (L83).
  - `packages/core/src/auth/user.repository.ts`: `IUserRepository` gains two methods. `UserRecord` is
    **not** changed (so `findById`/`findByEmail` SELECTs and every `UserRecord` fixture stay as they are).
- `apps/api` shared layer: `d1-user.repository.ts` (the only file that issues the new SQL).
- `apps/api` settings slice: `settings.handler.ts` (two routes and one refusal mapper). `settings.schema.ts`
  is not edited: the body schema is core's.
- `apps/api/src/middleware/permission.middleware.ts`: two `AUTHED` rows.
- `apps/api/migrations/0044_users_ui_prefs.sql`: one additive column.
- `apps/dashboard`: **no edit**. The dashboard reads the API through Hono `AppType`; two added routes are
  additive. Sprint 9 (`BeechPalPins`) is the consumer.

**c) `graphify affected` impact analysis**

```
graphify affected "D1UserRepository" --depth 2
- repository.middleware.ts [imports]              apps/api/src/middleware/repository.middleware.ts
- d1-last-global-admin.test.ts [imports]          apps/api/src/shared/db/repositories/d1-last-global-admin.test.ts
- d1-user.repository.test.ts [imports]            apps/api/src/shared/db/repositories/d1-user.repository.test.ts
- factory.ts [imports_from] / createBeechApp() [calls]   apps/api/src/factory.ts:L105
- repository-privacy-middleware.test.ts [imports_from]   apps/api/test/repository-privacy-middleware.test.ts

graphify affected "settingsApp" --depth 2
- factory.ts, routes.ts, index.ts [imports]
- settings.handler.test.ts [imports]
- factory.csp.test.ts, factory.custom-routes.test.ts, factory.docs-parity.test.ts [imports_from]
- apps/api/test/flow/flow-*.test.ts [imports_from]   (they build the whole app; none calls the new routes)

graphify explain "IUserRepository"
- Degree 1: only `user.repository.ts [contains]`. Type-only use; consumers listed by grep above.

graphify path "settingsApp" "D1Database"
- 6 hops via settings.handler.ts → Variables → stats.handler.ts → SYSTEM_TABLES → init.ts → createD1Database()
  (a shared-import chain, not a call chain: the handler holds no D1 handle and issues no SQL)
```

Breaking-change result: adding methods to `IUserRepository` breaks one implementer (updated here) and one
uncast test double (updated here). Adding routes breaks nothing: `factory.docs-parity.test.ts` only checks
the prefixes in its `routeDocMap` (L43-53), and `/api/settings` is not one of them. The route-table
completeness test turns red until the two rows exist, which is the intended guard.

**Facts established during research (the executor does not need to re-check these):**

1. `users.notification_prefs TEXT NOT NULL DEFAULT '{}'` is declared in `0000_v040_base.sql:L35`. The new
   column copies that declaration and stays separate from it (brief §4: never reuse or mix them).
2. Migrations are discovered through `"migrations_dir": "migrations"` (`apps/api/wrangler.jsonc:L25`) and
   `readD1Migrations` in `apps/api/vitest.workers.config.ts`. Adding the file is enough;
   `_config/database_workflow.md` step 2 is outdated (already established by sprint 3). `0043` is the last
   applied file, so this sprint takes `0044`.
3. SQLite (D1) accepts `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT '{}'` without a table rebuild, and
   existing rows read the default, so no backfill is needed (brief §4: "starts from an empty container").
4. The test harness inserts canonical users (`admin`, `editor`, `viewer`,
   `packages/testing/src/seeds/canonical.data.ts:L23-41`) with column lists that do not name `ui_prefs`,
   so they get the default. No harness edit.
5. `zodJson` (`apps/api/src/shared/utils/zod-json.ts`) reports a non-JSON body as a `custom` issue at path
   `[]` with `cause = 'malformed'`. The refusal mapper must branch on `cause` first, or a malformed body
   would be mistaken for the root-level byte-cap issue (also `custom` at `[]`).
6. In zod 4, a refinement on an object does not run when the object already has issues, so the byte-cap
   refinement only fires on a shape that is otherwise valid. An unknown key raises `unrecognized_keys`
   (with `keys: string[]`) at the path of the strict object, here `[]`.
7. Stable palette ids that sprint 9 will pin look like `nav:/content`, `nav:settings`,
   `content:open:<seedSlug>`, `content:create:<seedSlug>` (`apps/dashboard/src/features/command-palette/providers/*.ts`).
   They are short ASCII strings; recents already cap at 5 (`lib/recent-items-storage.ts:L8`).
8. Every self-service write in the slice is `AUTHED` and keyed on `jwtPayload.sub`; none takes a user id
   from the path or body (`settings.handler.ts:L250-315, L500-508`). That is what makes them self-only.

---

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

| Rule | Verdict | Evidence |
|------|---------|----------|
| 1. YAGNI | PASS | One column, one key (`palettePins`), two routes, two repository methods. No generic key-value store, no PATCH/merge semantics, no per-key endpoint, no `/me` change, no dashboard code. The byte cap is required by brief rule 11, not speculative. |
| 2. Botanical invariant | PASS | No content data is touched, so no `apiToDb`/`dbToApi` path and no Branch IDs are involved. `users` is a system table. The new SQL lives only in `D1UserRepository`, behind the `IUserRepository` contract in `@beechcms/core`. The schema and its caps are defined once in core and read by the API. |
| 3. VSA | PASS | All handler code stays in the settings slice and reaches storage through `context.get('userRepository')` (`AppEnv.Variables`, injected by `repositoryMiddleware`), as `/notifications` already does (`settings.handler.ts:L476`). No import from another feature slice. |
| 4. Cloudflare purity | PASS | One `ALTER TABLE ADD COLUMN` through the numbered migration workflow; one D1 statement per request. No ORM, no background job. |
| Self-only (brief §4) | PASS | Both routes read the user id from `jwtPayload.sub` only. There is no path or body parameter that names a user, so another account's container cannot be addressed. An integration test proves isolation. |

No violation found. No plan adjustment needed.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 9 (`BeechPalPins`) shows pinned rows "on any browser or device" (brief §3), so pins must live on
the server, per user. Nothing today can hold them: the only per-user JSON column is `notification_prefs`,
which the brief forbids reusing ("never reused or mixed"). The roadmap orders "API before UI, per server
change": the container lands and is validated alone (core schema, migration, route, isolation tests), and
the dashboard sprint then only projects it.

VSA: the routes join the settings slice, next to the other self-service preference routes
(`/profile`, `/avatar`, `/notifications`), and reach storage only through the injected `userRepository`.
The closed-key schema lives in `@beechcms/core` because it is the contract: the API validates writes
against it, and the same rules (cap, byte limit) are the ones sprint 9's UI must respect.

Botanical Engine: no seed or `content_{slug}` DDL changes; `users` is a system table changed through the
migration workflow.

Decisions taken here (sprint 9 depends on them):
- **Route:** `GET` and `PUT /api/settings/ui-preferences`, `AUTHED`, keyed on the JWT subject.
- **PUT replaces the whole container** (HTTP PUT semantics, same as `PUT /settings/notifications`, "a
  preference left out is switched off"). A key left out takes its default. The client sends the whole
  container; `GET` returns it whole. No merge, no read-modify-write on the server.
- **PUT answers 200 with the stored container**, so sprint 9 reconciles its optimistic list with what the
  server actually saved (brief: "never a falsely saved list").
- **One key, `palettePins`:** an ordered list (display order) of distinct, non-empty stable item ids, at
  most `PALETTE_PINS_MAX = 8`, each at most `PALETTE_PIN_ID_MAX_LENGTH = 200` characters. Duplicates are
  refused, not silently deduplicated, so the server never stores something other than what was sent.
- **Byte cap:** `UI_PREFERENCES_MAX_BYTES = 2048`, measured on the UTF-8 encoding of the normalized
  container's JSON. 8 ASCII ids of 200 characters serialize to about 1.7 KB, so ordinary ids never hit
  it; it bounds the column against multi-byte input today and against any future key.
- **No activity log entry on PUT.** Unlike `/notifications`, a pin toggle is cosmetic and frequent; logging
  it would push security-relevant rows (password, sessions) out of the 30-row activity tab
  (`ACTIVITY_LOG_LIMIT`, `settings.handler.ts:L31`).
- **A stored value that is not a valid container reads as the empty container.** `GET` never answers 500
  because of the column's contents.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

Request path for `/api/settings/*`:

1. `factory.ts` global middleware, in order: `repositoryMiddleware` (sets `userRepository`) →
   `seedRegistryMiddleware` → `storageMiddleware` → `queueMiddleware` → `authProvidersMiddleware` →
   `rateLimiterMiddleware` → `observabilityMiddleware` → … → `apiProtected.use('*', permissionMiddleware())`.
2. Route table, settings block (`permission.middleware.ts:L69-83`): self-service rows first, all `AUTHED`
   (`/me`, `/profile`, `/password`, `/avatar`, `/sessions`, `/sessions/:id`, `GET`/`PUT /notifications`,
   `/activity`), then the site-wide ones (`/storage`, `/storage/orphans/delete`, `GET`/`PUT /settings`).
   First match wins; enforcement is fail-closed.
3. Mounted by `routes.ts:L64` `.route('/settings', settingsApp)`.
4. Existing per-user preference pattern to mirror:
   - Read: `GET /notifications` (`settings.handler.ts:L473-494`): `findById(sub)` → 404 `{ error: 'User not
     found' }` when absent → tolerant `JSON.parse` of the stored string (catch ⇒ `{}`) → defaults filled.
   - Write: `PUT /notifications` (`L500-508`): `zodJson(schema, rejectInvalidBody)` →
     `updateNotificationPreferences(sub, JSON.stringify(body))` → `logActivity` → `{ success: true }`.
   - Repository: `updateNotificationPreferences` (`d1-user.repository.ts:L153-158`), one `UPDATE … WHERE id = ?`.
   - Contract: `IUserRepository.updateNotificationPreferences` (`user.repository.ts:L95-96`).
5. Refusal mappers in the slice (`settings.handler.ts:L36-84`): a body that is not a JSON object answers
   `{ error: 'Invalid JSON body' }` 400 everywhere (`isNotAnObject`, L37); typed problems use a `type`
   slug (`settings-storage-invalid-orphan-keys`, L83).
6. `settings-json-body.integration.test.ts:L16-22`: a `BODY_ROUTES` table proving each PUT route answers a
   non-object JSON body with 400.

Context variables used (all already in `AppEnv.Variables`, `apps/api/src/types.ts`): `userRepository`,
`jwtPayload`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create:
- `apps/api/migrations/0044_users_ui_prefs.sql`
- `packages/core/src/settings/ui-preferences.ts`
- `packages/core/src/settings/ui-preferences.test.ts`
- `apps/api/src/features/settings/test/integration/settings-ui-preferences.integration.test.ts`

Edit:
- `packages/core/src/index.ts`: star-export `./settings/ui-preferences.js`.
- `packages/core/src/auth/user.repository.ts`: `IUserRepository.findUiPreferences`, `updateUiPreferences`.
- `apps/api/src/shared/db/repositories/d1-user.repository.ts`: both methods.
- `apps/api/src/features/settings/settings.handler.ts`: `rejectInvalidUiPreferences`, `GET` and
  `PUT /ui-preferences`.
- `apps/api/src/middleware/permission.middleware.ts`: two rows.
- Tests: `apps/api/src/shared/db/repositories/d1-user.repository.test.ts`,
  `apps/api/src/features/settings/settings.handler.test.ts`,
  `apps/api/src/features/rbac/invitations.public.test.ts` (compile fix only),
  `apps/api/src/features/settings/test/integration/settings-json-body.integration.test.ts` (one table row).

Not touched: anything in `apps/dashboard`, `settings.schema.ts`, `UserRecord`, `GET /settings/me`,
`notification_prefs` and its routes, `docs/reference/*`, `packages/cli/src/commands/init.ts`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Migration `0044`

File `apps/api/migrations/0044_users_ui_prefs.sql`. Copy the header-banner style of
`0041_drop_users_role.sql` (a comment block that says why). Verbatim DDL:

```sql
ALTER TABLE users ADD COLUMN ui_prefs TEXT NOT NULL DEFAULT '{}';
```

The banner states: per-user UI preferences container (closed keys, validated by the API against
`@beechcms/core`'s `uiPreferencesSchema`); deliberately separate from `notification_prefs`; existing rows
read the default `'{}'`, so there is no backfill. Do not add a `wrangler.jsonc` entry (fact 2). Do not
edit any earlier migration.

### Task 2 — Core: the container contract

File `packages/core/src/settings/ui-preferences.ts`, MIT header like the other core files
(`user.repository.ts:L1-2`). Copy the zod idiom of `dashboard-layout/content-view.ts` (`import { z } from
'zod'`, exported schema + `z.infer`/`z.output` type). Exported building blocks, verbatim:

```ts
/** Most pins a user can keep: the section must stay a shortcut (brief §4). */
export const PALETTE_PINS_MAX = 8
/** Longest stable palette item id accepted as a pin. */
export const PALETTE_PIN_ID_MAX_LENGTH = 200
/** Ceiling on the stored container: UTF-8 bytes of its JSON (brief rule 11). */
export const UI_PREFERENCES_MAX_BYTES = 2048

/**
 * The per-user UI preferences container (`users.ui_prefs`). Closed keys: an unknown key is refused.
 * A key left out takes its default, so a PUT body replaces the whole container.
 */
export const uiPreferencesSchema: z.ZodType<UiPreferences, UiPreferencesInput>

/** The container as stored and returned. */
export type UiPreferences = {
  /** Stable palette item ids, in display order. */
  palettePins: string[]
}

/** The container as a client may send it: every key optional. */
export type UiPreferencesInput = {
  palettePins?: string[]
}

/** The container of a user who has never written one. */
export const EMPTY_UI_PREFERENCES: UiPreferences

/** UTF-8 byte length of the container's JSON, the quantity `UI_PREFERENCES_MAX_BYTES` bounds. */
export function uiPreferencesByteLength(preferences: UiPreferences): number

/**
 * Reads a stored `users.ui_prefs` value. Anything that is not valid JSON or not a valid container
 * yields `EMPTY_UI_PREFERENCES`; never throws.
 */
export function parseStoredUiPreferences(stored: string): UiPreferences
```

The executor may let TypeScript infer the schema's type instead of the explicit annotation, provided
`UiPreferences` and `UiPreferencesInput` are exported with exactly the shapes above (assert it with a
`satisfies` or a type-level check if inference is used).

Schema rules:
- `z.strictObject` with one key, `palettePins`: an array of strings, each `.min(1)` and
  `.max(PALETTE_PIN_ID_MAX_LENGTH)`, the array `.max(PALETTE_PINS_MAX)`, distinct (a `refine` on the array,
  same idiom as `deleteOrphansRequestSchema.keys`, `settings.schema.ts:L97`), `.default([])`.
- Ids are **not** trimmed, pattern-checked or lowercased: they are opaque to the server; sprint 9 owns
  their meaning.
- A root `refine` checks `uiPreferencesByteLength(value) <= UI_PREFERENCES_MAX_BYTES`. It must be the only
  root-level `custom` issue the schema can raise (the API relies on that, Task 5).
- `uiPreferencesByteLength`: the length of `new TextEncoder().encode(JSON.stringify(preferences))`.
- `EMPTY_UI_PREFERENCES` is `{ palettePins: [] }`, frozen (`Object.freeze`, array included) so a caller
  cannot mutate the shared default.
- `parseStoredUiPreferences`: `JSON.parse` inside a try; then `uiPreferencesSchema.safeParse`; any failure
  returns `EMPTY_UI_PREFERENCES`. A stored `'{}'` parses to `{ palettePins: [] }` through the default.

Barrel: add `export * from './settings/ui-preferences.js'` to `packages/core/src/index.ts` right after
L83 (`site-settings.repository.js`).

### Task 3 — Core: repository contract

`packages/core/src/auth/user.repository.ts`, add to `IUserRepository` right after
`updateNotificationPreferences` (L96):

```ts
  /**
   * The user's stored UI preferences container (`users.ui_prefs`) as a raw JSON string, or null when the
   * user does not exist. Parsing and defaults belong to `parseStoredUiPreferences`.
   */
  findUiPreferences(userId: string): Promise<string | null>

  /**
   * Replaces the user's UI preferences container with `preferencesJson`, already validated against
   * `uiPreferencesSchema`. Returns false when no user row matched, so nothing was written.
   */
  updateUiPreferences(userId: string, preferencesJson: string): Promise<boolean>
```

Why a dedicated read instead of a `UserRecord` field: `findById`/`findByEmail` serve login and every
profile route, and the container is read only by its own route. Keeping it out of `UserRecord` leaves
those SELECTs and every `UserRecord` fixture unchanged.

### Task 4 — `D1UserRepository`

File `apps/api/src/shared/db/repositories/d1-user.repository.ts`. Place both methods right after
`updateNotificationPreferences` (L153-158) and copy its shape.
- `findUiPreferences`: one statement, `SELECT ui_prefs FROM users WHERE id = ? LIMIT 1`, `.first<{ ui_prefs:
  string }>()`; return the string, or `null` when there is no row.
- `updateUiPreferences`: one statement, `UPDATE users SET ui_prefs = ? WHERE id = ?`, bound
  `(preferencesJson, userId)`; return `(result.meta.changes ?? 0) > 0`, the same idiom as `setActive`
  (L210).
- No parsing, no validation, no defaults in the adapter.

### Task 5 — Settings slice routes

File `apps/api/src/features/settings/settings.handler.ts`.

Imports: add `parseStoredUiPreferences`, `uiPreferencesSchema`, `UI_PREFERENCES_MAX_BYTES` to the existing
`@beechcms/core` import (L10). Import `type ZodJsonRefusal` from `../../shared/utils/zod-json` beside
`zodJson`.

Refusal mapper `rejectInvalidUiPreferences(context, error, cause)`, placed after `rejectInvalidOrphanKeys`
(L82-84). All answers are 400. Classification of the **first** issue, in this order:

| Condition | Body |
|-----------|------|
| `cause === 'malformed'`, or the first issue is at path `[]` with code `invalid_type` (body is `null`, an array or a scalar) | `{ error: 'Invalid JSON body' }` (the slice-wide shape, `L47`) |
| code `unrecognized_keys` | `{ type: 'ui-preferences-unknown-key', keys: issue.keys }` |
| code `custom` at path `[]` | `{ type: 'ui-preferences-too-large', maxBytes: UI_PREFERENCES_MAX_BYTES }` |
| anything else | `{ type: 'ui-preferences-invalid', field: String(issue.path[0]) }` |

Error codes (verbatim): `ui-preferences-unknown-key`, `ui-preferences-too-large`, `ui-preferences-invalid`.

Routes, chained after `PUT /notifications` (L500-508), each with a JSDoc banner like its neighbours:

- `GET /ui-preferences`: `const { sub: userId } = context.get('jwtPayload')` →
  `context.get('userRepository').findUiPreferences(userId)`. `null` ⇒ 404 `{ error: 'User not found' }`
  (same as L478). Otherwise 200 with `parseStoredUiPreferences(stored)`.
- `PUT /ui-preferences`: `zodJson(uiPreferencesSchema, rejectInvalidUiPreferences)` →
  `updateUiPreferences(userId, JSON.stringify(context.req.valid('json')))`. `false` ⇒ 404
  `{ error: 'User not found' }`. Otherwise 200 with the validated container (defaults filled), which is
  exactly what was stored.
- **No `logActivity`** on PUT. Put a one-line comment saying why (SECTION 1: cosmetic and frequent; it
  would crowd the activity tab).
- No user id is read from the path, the query or the body.

### Task 6 — Route table rows

`apps/api/src/middleware/permission.middleware.ts`: insert after the `PUT /notifications` row (L77),
inside the self-service block, aligned like its neighbours:

```ts
  { method: 'GET',    pattern: /^\/api\/settings\/ui-preferences$/,        requirement: AUTHED },
  { method: 'PUT',    pattern: /^\/api\/settings\/ui-preferences$/,        requirement: AUTHED },
```

No permission is needed beyond being authenticated: the container is the caller's own (fact 8), and a
viewer pins as much as an administrator.

### Task 7 — Tests

All files open with the SPDX header (core files: the MIT header their neighbours use). Single quotes
(`packages/*`, `apps/api`). No `any` in **new** code: where an existing file already uses `any`
(`settings.handler.test.ts:L13`, `d1-user.repository.test.ts:L27-30`), reuse its helper as is and do not
widen the pattern.

**7a. Unit — `packages/core/src/settings/ui-preferences.test.ts`** (new; copy the layout of
`auth/account-email.test.ts`). `describe('uiPreferencesSchema')`, `describe('parseStoredUiPreferences')`,
`describe('uiPreferencesByteLength')`.
- `uiPreferencesSchema`:
  - an empty object parses to `{ palettePins: [] }`.
  - an ordered list of distinct ids parses unchanged, order preserved.
  - an unknown key is refused with one `unrecognized_keys` issue naming it.
  - a malformed-pins matrix (one cause: the pins value breaks a per-item or per-list rule), driven from an
    array, is refused with an issue at path `['palettePins', …]`: 9 ids (`PALETTE_PINS_MAX + 1`), an empty
    string id, an id of `PALETTE_PIN_ID_MAX_LENGTH + 1` characters, a duplicated id, a non-string id, a
    non-array value.
  - 8 distinct ids of 200 two-byte characters (`'é'`) are refused by one `custom` issue at path `[]`;
    comment that each id is within the length cap, so only the byte cap can refuse it.
  - 8 distinct ASCII ids of 200 characters are accepted (regression guard: the byte cap must never bite on
    ordinary ids).
- `parseStoredUiPreferences`: a matrix (one cause: the stored value is not a valid container), driven from
  an array, every row yields `EMPTY_UI_PREFERENCES`: `'not json'`, `'null'`, `'[]'`, `'{"theme":"dark"}'`,
  `'{"palettePins":"nav:/content"}'`. A separate `it()`: `'{}'` yields `{ palettePins: [] }`. A separate
  `it()`: a valid stored container yields its pins in order.
- `uiPreferencesByteLength`: counts UTF-8 bytes, not UTF-16 code units (`'é'` pins measure larger than
  their `.length`).

**7b. Unit — `apps/api/src/shared/db/repositories/d1-user.repository.test.ts`** (existing; reuse
`makeMockDb`, L18-31). New `describe('findUiPreferences')` and `describe('updateUiPreferences')`:
- `findUiPreferences` selects `ui_prefs` by id and returns the stored string.
- `findUiPreferences` returns `null` when no row matches.
- `updateUiPreferences` binds `(json, userId)` to an `UPDATE users SET ui_prefs = ?` statement and
  returns true when one row changed.
- `updateUiPreferences` returns false when no row changed (`runChanges: 0`).

**7c. Unit — `apps/api/src/features/settings/settings.handler.test.ts`** (existing; reuse `buildApp`, L13).
New `describe('GET /ui-preferences')` and `describe('PUT /ui-preferences')`; pass a `userRepository` mock
exposing `findUiPreferences` / `updateUiPreferences` only:
- `GET` answers 200 with the parsed container of the stored string.
- `GET` answers 404 when `findUiPreferences` resolves `null`.
- `PUT` stores the normalized container: `{}` in the body reaches `updateUiPreferences` as
  `'{"palettePins":[]}'` for the JWT subject, and the response body is `{ palettePins: [] }`.
- `PUT` answers 404 when `updateUiPreferences` resolves false.
- The refusal mapper, as a matrix (one cause: an invalid body), each row with its status and `type` or
  `error`, and `updateUiPreferences` never called: malformed JSON text → `error: 'Invalid JSON body'`;
  `null` → `error: 'Invalid JSON body'`; `{ theme: 'dark' }` → `ui-preferences-unknown-key` with
  `keys: ['theme']`; `{ palettePins: ['a', 'a'] }` → `ui-preferences-invalid` with `field: 'palettePins'`;
  eight 200×`'é'` ids → `ui-preferences-too-large` with `maxBytes: 2048`.

**7d. Compile fix — `apps/api/src/features/rbac/invitations.public.test.ts`** (existing): add
`findUiPreferences` and `updateUiPreferences` typed `vi.fn`s to the `users` object (L48-63), after
`updateNotificationPreferences`, in the file's idiom. No new `it()`.

**7e. Integration — `apps/api/src/features/settings/test/integration/settings-json-body.integration.test.ts`**
(existing): add `{ path: '/api/settings/ui-preferences', user: 'editor' }` to `BODY_ROUTES` (L16-22) and
update the docblock's route count (five → six).

**7f. Integration — `apps/api/src/features/settings/test/integration/settings-ui-preferences.integration.test.ts`** (new)
- Tier: integration, real D1 through `createTestHarness`, `createBeechApp({ seeds: [], authProviders })`.
  Copy the setup of `settings-json-body.integration.test.ts:L28-37`.
  `describe('settings slice — UI preferences (real D1)')`, nested `describe('GET /api/settings/ui-preferences')`
  and `describe('PUT /api/settings/ui-preferences')`. A two-to-five-line file docblock (scope: the
  container's contract and its per-user isolation).
- Fixture source: canonical users (`admin`, `editor`, `viewer`) from `@beechcms/testing`. Pin ids are
  short literals in the production shape (`'nav:/content'`, `'content:open:posts'`). Malformed bodies are
  hand-rolled (rule 3.5 allows it for rejection tests). State is read back with direct SQL on `users`
  (`SELECT ui_prefs, notification_prefs FROM users WHERE id = ?`, rule 3.8: structural table).
- `it()`s:
  - a user who never wrote the container reads `{ palettePins: [] }` (migration default, no backfill).
  - a viewer's PUT answers 200 with the stored container, and the `ui_prefs` column holds exactly its JSON
    (least-privileged role: `AUTHED` is enough).
  - a PUT leaves `notification_prefs` unchanged (regression guard: the two containers never mix, brief §4).
  - a PUT that omits `palettePins` clears the pins (replace semantics; arrange a first PUT with pins).
  - the admin's write is invisible to the editor: after the admin PUTs pins, the editor's GET reads
    `{ palettePins: [] }` and the editor's `ui_prefs` column is still `'{}'` (isolation).
  - an unknown key answers 400 `ui-preferences-unknown-key` and the column is unchanged (assert the value
    stored by an ARRANGE PUT, not just `'{}'`).
  - nine pins answer 400 `ui-preferences-invalid` and the column is unchanged.
  - an over-size container answers 400 `ui-preferences-too-large` and the column is unchanged.
  - a corrupt stored value reads as the empty container: ARRANGE `UPDATE users SET ui_prefs = 'not json'
    WHERE id = ?`; GET answers 200 `{ palettePins: [] }`. Comment: this simulates a value written outside
    the API.
- Status asserted first; bodies typed at the call site (`{ palettePins: string[] }`,
  `{ type: string; keys?: string[] }`). Rejections assert the column is unchanged (rule 5.6).
- §6.2(3) deliberate-omission comment: the unauthenticated refusal and the route's registration are covered
  by the fail-closed route table and its completeness test (`permission.middleware.test.ts:L14`), not here.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root unless stated.

1. `pnpm run build` in `packages/core/` (the API consumes the built core types).
2. `cd packages/core && npx vitest run src/settings/ui-preferences.test.ts`
3. `npx tsc --noEmit` in `apps/api/` (also proves the `invitations.public.test.ts` double compiles).
4. `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` (proves the additive `AppType` change breaks
   nothing).
5. `pnpm beech lint`
6. `cd apps/api && npx vitest run src/features/settings src/shared/db/repositories/d1-user.repository.test.ts src/middleware/permission.middleware.test.ts src/features/rbac/invitations.public.test.ts`
7. `cd apps/api && npx vitest run --config vitest.workers.config.ts src/features/settings`
   (integration tier, real D1; migrations, including `0044`, are applied by the harness setup file).
8. `pnpm beech db:reset`, then `pnpm beech db:migrate`. `0044` applies cleanly on a fresh local D1, and
   `PRAGMA table_info(users)` lists `ui_prefs` (`TEXT`, `notnull = 1`, default `'{}'`).
9. `pnpm beech test --diff`
10. Boundary grep: `grep -rn "ui_prefs" apps/api/src --include=*.ts` → matches only in
    `shared/db/repositories/d1-user.repository.ts` and test files.
11. `graphify update . --force`, then `graphify affected "parseStoredUiPreferences()" --depth 2` → only
    `settings.handler.ts`, the core barrel and their tests.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PALETTE_PINS_MAX`, `PALETTE_PIN_ID_MAX_LENGTH`, `UI_PREFERENCES_MAX_BYTES`, `uiPreferencesSchema`,
      `UiPreferences`, `UiPreferencesInput`, `EMPTY_UI_PREFERENCES`, `uiPreferencesByteLength`,
      `parseStoredUiPreferences`, `IUserRepository.findUiPreferences` / `updateUiPreferences`, the route rows
      and the three error codes match SECTION 4 verbatim.
- [ ] Core gains no dependency; the new core module is exported from the barrel.
- [ ] `0044_users_ui_prefs.sql` holds exactly the one `ALTER TABLE … ADD COLUMN` (plus its banner). No
      `wrangler.jsonc` edit, no applied migration edited, no backfill.
- [ ] `GET /api/settings/ui-preferences` returns the caller's container; a user who never wrote one, or
      whose stored value is invalid, reads `{ palettePins: [] }`. It never answers 500 because of the stored value.
- [ ] `PUT /api/settings/ui-preferences` replaces the caller's container, answers 200 with exactly what was
      stored, and writes no activity log row.
- [ ] Unknown key, pin cap, id length, duplicate id and byte cap are refused with 400 and the codes of
      SECTION 4; a refused write changes nothing.
- [ ] Both routes are `AUTHED` and keyed on `jwtPayload.sub` only; an integration test proves one user's
      write is invisible to and does not touch another user's container.
- [ ] `notification_prefs`, its routes, `UserRecord` and `GET /settings/me` are unchanged.
- [ ] No SQL outside `apps/api/src/shared/db/repositories/`. No import from another feature slice.
- [ ] No file under `apps/dashboard` is modified. The dashboard `tsc` still passes.
- [ ] All SECTION 5 commands pass. New tests follow `_config/testing_conventions.md` (tier, placement,
      four zones, typed bodies, no `any` in new code, state asserted after writes and rejections, required
      §6.2 comments).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

- **Any dashboard change.** Pin / unpin from the row submenu, the pinned section, resolving pins against
  provider output, the "unavailable" state and the rollback on write failure are ROADMAP entry 9
  (`BeechPalPins`). Do not add a dashboard API client, hook or locale key.
- Any second key in the container, a generic key-value store, PATCH or per-key routes, or a server-side
  merge (brief §5: the container is not a generic store).
- Reading or writing another user's container (no admin route, no `:id` parameter).
- Adding the container to `GET /settings/me` or to `UserRecord`.
- Validating pin ids against the palette's real ids: they are opaque to the server.
- Activity-log entries or locale keys for preference writes.
- `docs/reference/*` additions; the stale `users` DDL in `packages/cli/src/commands/init.ts` (it still
  carries the dropped `role` column; separate issue).
- Server-side recents (brief §5: they stay in the browser), quick-notes sync, `notification_prefs` reuse.
- `BeechPalMediaActions` (ROADMAP entry 6b, blocked) and everything in entry 9.
