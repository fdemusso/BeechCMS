# Sprint: LocalizedWritePath

Sprint 2 of 5 of **Field-Level Localization** (roadmap: `backlog/ROADMAP.md`).
Every content write in `apps/api` stores locale dictionaries without ever losing a translation.
Sprint 1 (`LocalizationCoreContracts`, archived in `docs/Sprints/LocalizationCoreContracts/`, review PASS)
left the engine dormant: `validateAndSanitizeSeedPayload` accepts a `localeConfig` option but no caller
passes one, and nothing stores a project language configuration. This sprint provisions that
configuration and wires it into every write path, merging each write into the stored dictionary.
A seed with no `localized: true` branch behaves exactly as it does today, and costs no extra D1 read.

---

### Pre-Computation Analysis

Graph refreshed first with `graphify update . --force` (21 179 nodes, 32 078 edges, 1 981 communities).
It includes Sprint 1's working-tree code (`engine/localization.ts` and the rest).

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `createBeechApp()` | **78** | `apps/api/src/factory.ts:L117` | Composition root. **Not touched.** No middleware, route, or registration-order change. `siteSettingsRepository` is already injected for every request by `repositoryMiddleware` (step 1). |
| `D1ContentRepository` | **53** | `apps/api/src/shared/db/repositories/content.repository.d1.ts:L119` | **Not touched.** Every write reaches it with a value that has already been merged (`mergeLocalizedFields`). It serializes through `serializeForDb`, which already compacts dictionaries (Sprint 1). |
| `validateAndSanitizeSeedPayload()` | **22** | `packages/core/src/engine/validation/index.ts:L425` | **Every production caller now passes `localeConfig`**: `createHandler`, `updateHandler`, draft `PUT`, `sanitizePublicPayload` (public add / edit), and `contentImportChunkJob`. `kanbanMoveHandler` and `rotate-field` are excluded by construction (see VETO §4). One change in core: the required-field check on `update`. |
| `resolveKanbanConfig()` | 6 | `packages/core/src/dashboard-layout/kanban/kanban.ts:L64` | `isAxisCandidate` rejects localized branches, so kanban can never write one. |
| `D1SiteSettingsRepository` | 6 | `apps/api/src/shared/db/repositories/site-settings.repository.d1.ts:L18` | Gains the `locales` (JSON array) and `defaultLocale` keys. |
| `executeEditField()` | 6 (affected) | `apps/api/src/features/automations/executors/edit-field.executor.ts:L11` | Refuses localized targets. Today it writes raw values with no validation, so it would overwrite a whole dictionary. |
| `bulkHandler()` | — | `apps/api/src/features/content/handlers/bulk.handler.ts:L31` | Refuses localized fields. It writes raw values straight to `repository.bulkUpdate`, so it would overwrite a whole dictionary. |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — `engine/localization.ts` | **Yes** | New pure exports: `LocaleSettings`, `resolveLocaleConfig`, `applyLocalizedPatch`, `localizedAliasesIn`, `mergeLocalizedFields`, `resolveLocalizedValue`, `resolveLocalizedFields`. The helper `isStoredLocaleDictionary` stays private. Zero I/O. |
| `@beechcms/core` — `validation/index.ts` | **Yes** | In `detectMissingRequired`, an `update` whose patch does not name the default locale leaves that locale untouched and is not "empty". |
| `@beechcms/core` — `settings/site-settings.repository.ts` | **Yes** | `SiteSettings.locales: string[] \| null`, `SiteSettings.defaultLocale: string \| null`. |
| `@beechcms/core` — `dashboard-layout/kanban/kanban.ts` | **Yes** | `isAxisCandidate` excludes localized branches. |
| `@beechcms/core` — `serialize.ts`, `query.ts`, DDL, FTS, schema-fingerprint, seed-validation | **No** | Unchanged. |
| `apps/api/shared/localization/` | **Yes (new)** | `locale-config.ts`: `loadLocaleConfig(repository, seed)`. Shared helper consumed by four slices, so it lives in `shared/`, never in a slice. |
| `apps/api/shared/db/repositories/site-settings.repository.d1.ts` | **Yes** | Parses and serializes the two new keys. |
| `apps/api/features/settings` | **Yes** | `GET /api/settings` exposes the resolved `locales` / `defaultLocale`; `PUT /api/settings` validates and persists them. |
| `apps/api/features/content` | **Yes** | `create.ts`, `update.ts`, `bulk.handler.ts`, `jobs/import-chunk.worker.ts`. `kanban-move.ts` is **not** touched. |
| `apps/api/features/draft` | **Yes** | `draft.handler.ts` (`PUT /:slug/:id/draft`). |
| `apps/api/features/automations` | **Yes** | `executors/edit-field.executor.ts` (guard only). |
| `apps/api/public` | **Yes** | `sanitize.ts`, `public-add.ts`, `public-edit.ts`. |
| `apps/api` — `factory.ts`, `types.ts`, `middleware/`, `D1ContentRepository`, migrations | **No** | Zero files, zero SQL, zero migrations: `site_settings(key, value)` already exists (`0000_v040_base.sql:L251`). |
| `apps/dashboard`, `@beechcms/client`, `api-client`, `mcp`, `cli`, `testing` | **No** | Zero files. |

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "validateAndSanitizeSeedPayload()" --depth 2
- createHandler()          [calls] apps/api/src/features/content/handlers/create.ts:L26
- kanbanMoveHandler()      [calls] apps/api/src/features/content/handlers/kanban-move.ts:L15
- updateHandler()          [calls] apps/api/src/features/content/handlers/update.ts:L28
- sanitizePublicPayload()  [calls] apps/api/src/public/sanitize.ts:L26
- publicAddHandler()       [calls] apps/api/src/public/public-add.ts:L133
- resolveData()            [calls] apps/api/src/public/public-edit.ts:L66
- (+ core validation suites, localized-schema.test.ts, core-validation.test.ts, kanban-move.test.ts)
  Graph misses two dynamic-context callers; grep finds them:
  draft.handler.ts:L101, import-chunk.worker.ts:L154 (and rotate-field.handler.ts:L108, confidential-only)

$ graphify affected "resolveKanbanConfig()" --depth 2
- kanbanMoveHandler()      [calls] apps/api/src/features/content/handlers/kanban-move.ts:L15
- kanbanPositionHandler()  [calls] apps/api/src/features/content/handlers/kanban-position.ts:L11
- listHandler()            [calls] apps/api/src/features/content/handlers/list.ts:L92

$ graphify affected "D1SiteSettingsRepository" --depth 2
- repository.middleware.ts [imports] → createBeechApp() [calls] apps/api/src/factory.ts:L117
- site-settings.repository.d1.test.ts, apps/api/test/repository-privacy-middleware.test.ts
  (SiteSettings / ISiteSettingsRepository consumers by grep: types.ts, repository.middleware.ts,
   settings.handler.ts, setup/index.ts — setMany({ defaultLanguage, timezone, currency }) only)

$ graphify affected "executeEditField()" --depth 2
- executeAction() [calls] executors/index.ts:L25 → AutomationRunner.run() L46, runCronAutomations() L31

$ graphify affected "bulkHandler()" / "updateHandler()" / "createHandler()" --depth 2
- content/index.ts [imports] → factory.ts            (route registration only)

$ graphify affected "publicEditHandler()" --depth 2
- public/index.ts [re_exports], public-routes.ts [imports] → factory.ts

$ graphify affected "contentImportChunkJob()" --depth 2
- import-chunk.worker.test.ts [imports]
```

**Breaking-change verdict: none for any seed without a localized branch.**
- `loadLocaleConfig` returns `undefined` when the seed has no localized branch. Every handler then calls
  `validateAndSanitizeSeedPayload` with `localeConfig: undefined`, byte-for-byte what it passes today.
  `mergeLocalizedFields` and `resolveLocalizedFields` return their input unchanged. No new D1 read occurs.
- `detectMissingRequired`: the new skip runs only under `options.localeConfig && isLocalizedBranch(branch)`.
- `isAxisCandidate`: the new guard fires only for `localized === true`. No shipped seed carries it (Sprint 1 proof).
- `SiteSettings` gains two fields. Its only producer (`D1SiteSettingsRepository.getAll`) sets them. Its
  consumers read named fields only. `setup/index.ts` passes a `Partial` without them, so it is unaffected.
  One existing unit assertion (`getAll` defaults `toEqual`) must include the two new `null` keys. That is a
  contract change, not a test being bent to fit the code.
- `GET /api/settings` gains two keys (additive; the dashboard's `GeneralSettings` type ignores unknown keys).
  `PUT /api/settings` without `locales` / `defaultLocale` runs exactly today's code path.
- Bulk, kanban and `edit_field` gain refusals that fire only on localized branches. Localized branches can
  exist only through the Seeds API, so these refusals cannot change current behaviour.

**VSA boundary proof:**
```
$ graphify path "resolveKanbanConfig()" "D1ContentRepository"
  resolveKanbanConfig() <--calls-- listHandler() <--imports-- index.ts <--imports_from-- factory.ts
  --imports_from--> repository.middleware.ts --imports--> D1ContentRepository
$ graphify path "toLocalizedPatch()" "D1Database"
  toLocalizedPatch() <--contains-- localization.ts <--re_exports-- index.ts --re_exports--> types.ts
  <--imports_from-- index.ts --re_exports--> init() --calls--> createD1Database()
```
Core reaches storage only *backwards*, through its importers and the API composition root. The new core
functions import only `./types.js` (types) and `./validation/primitives.js`. The only new cross-slice
dependency is on `apps/api/src/shared/localization/locale-config.ts`. It lives in `shared/`, which slices
already import (`shared/policies`, `shared/utils`), and it is never imported slice-to-slice.

---

### VETO Audit

**1. THE BOTANICAL INVARIANT — no D1 query bypasses `@beechcms/core`.**
- ✅ Zero new SQL against `content_*` tables. Merge semantics (`applyLocalizedPatch`) live in core. Handlers
  hand the repository a fully merged value, and the repository serializes it through `serializeForDb` as
  it does today.
- ✅ The only new D1 access is on `site_settings`, through the existing `D1SiteSettingsRepository.getAll`.
  It uses the existing `SELECT key, value FROM site_settings` and the existing upsert.
- ✅ No hardcoded field names. Every rule keys on `isLocalizedBranch(branch)` over `seed.branches`. The
  legacy `title`/`name` fallbacks already present in `create.ts`, `update.ts`, `public-*.ts` are only fed
  resolved values now; no new alias literal is introduced.

**2. VSA ENFORCEMENT — zero cross-feature imports.**
- ✅ Four slices plus `public/` need the same "load config → merge → resolve display value" steps. The pure
  logic goes to `@beechcms/core`. The single I/O step (`loadLocaleConfig`) goes to `apps/api/src/shared/`.
  No slice imports another slice.
- ✅ Test placement mirrors the slices: `features/settings/test/integration/`,
  `features/content/test/integration/`, `features/draft/test/integration/`, `public/test/integration/`.

**3. CLOUDFLARE PURITY.**
- ✅ No migration, no new table, no KV, no background job. Locale config is two rows in the existing
  `site_settings` key-value table.

**4. YAGNI / RUTHLESS VETO — every addition has a consumer in this sprint.**
- ✂ **Isolate cache for `LocaleConfig` (roadmap §2) — VETOED.** A per-isolate cache "invalidated on settings
  PUT" invalidates only the isolate that served the PUT; every other isolate keeps a stale config. That is
  a correctness bug. The cost it avoids is one tiny `SELECT` per *write* on a seed that has a localized
  branch (non-localized seeds skip it). Sprint 3's public read path is the hot path that may need
  a cache. It must then use a version token, like `seedRegistryMiddleware` does. → ROADMAP §3.
- ✂ **`localeConfig` in `kanbanMoveHandler` — replaced.** Kanban axes are enumerated values (`text` with
  `options`, `tags`, `boolean`). A localized axis would group cards by a dictionary. A move would write the
  column value over the whole dictionary. Excluding localized branches in core `isAxisCandidate` removes the
  need, and the existing `400 content-invalid-kanban-axis` refuses such moves.
- ✂ **Per-entry merge in bulk edit — replaced by refusal.** `bulkUpdate` writes blind `UPDATE`s for up to 500
  ids. A merge would need a read per id inside the repository. No product surface asks for bulk translation.
  Localized fields answer the existing `400 field-not-bulk-editable`. → ROADMAP §4 (dashboard bulk UI hides them).
- ✂ **Merge in automation `edit_field` — replaced by refusal.** `ActionContext` carries no settings
  repository, and the executor writes raw values with no validation. It throws on a localized target (the
  run is recorded as failed). No data is lost and no plumbing is added. Listed as a known v1 limit in the ROADMAP.
- ✅ **Pulled forward from Sprint 3: `resolveLocalizedValue` / `resolveLocalizedFields`.** This sprint
  introduces its own consumer. Once create stores `{"it":"Scarpa"}`, the slug fallback
  (`slugify(String(privacyData.title))`) produces `object-object`, and activity-log / notification titles
  render `[object Object]`. The resolver implements the chain roadmap §3 already specified. Sprint 3
  reuses it and does not redefine it.
- ✅ `mergeLocalizedFields` is consumed by create, update, draft, public add, public edit and import.
  `localizedAliasesIn` is consumed by the update-path concurrency guard and the draft read guard.
- ✅ `MAX_LOCALES = 50` on `PUT /api/settings`. It bounds column size (each locale is validated against
  `maxTextLength` separately, Sprint 1). It is a validation constant, not a feature.

**Violations found and corrected during this audit:**

1. **Lost translation under concurrent writes.** The update path merges against the row the handler read
   (`current`). A second write between that read and the `UPDATE` would be overwritten, dropping its
   translation. When a write merges a localized branch and the client sent no `If-Match` / `updated_at`,
   the handler passes `ifMatch: current.updated_at` itself. The race turns into the existing
   `409 content-update-conflict` instead of silent loss. Public edit gets the same guard and learns to map
   `EntryConflictError` → `409` (today it would answer `500`). Residual limit, shared with every
   existing OCC path: `updated_at` has second granularity.
2. **`requiredOnUpdate` would block every single-language save.** Sprint 1's `detectMissingRequired` checks
   `patch[defaultLocale]`. `PUT {title: {en: "Shoe"}}` on a `requiredOnUpdate` title would fail with
   `required-field/empty`, even though the merge keeps the stored Italian value. Fix in core: on `update`,
   a patch that does not name the default locale leaves it as stored. Explicitly clearing the default
   locale (`{it: ""}` or `null`) is still refused.
3. **Draft autosave would erase the other translations on publish.** Drafts store only the touched columns,
   and `publishDraft` copies them over the live row. A draft holding `{en}` alone would publish over the live
   `{it, en}` dictionary. The draft handler merges against the pending draft value when the field was
   touched, else against the live value. `publishDraft` then copies a complete dictionary, and its existing
   `live_snapshot_at` guard covers live-side races.
4. **Legacy json values are not dictionaries.** A json branch localized after rows already held
   `{"url": "…", "alt": "…"}` must merge that value as the default-locale value. It must not merge
   *into* it, which would add `en` as a sibling of `url`. Stored-value detection therefore requires a
   registered locale key for `json`, the same rule Sprint 1 uses on writes and roadmap §3 specifies for
   reads. Text and richtext cannot hold a locale-keyed object for any other reason, so the structural
   check suffices there. This is what makes orphan locales (removed from `locales`) survive a text write.
5. **Implicit config coupled to the dashboard UI language.** `resolveLocaleConfig` defaults to
   `[defaultLanguage]` (brief §2). Changing the UI language before languages were ever configured would
   silently move the implicit default locale. Mitigation: the first `PUT /api/settings` that touches
   `locales` or `defaultLocale` **persists both keys**, so from then on the config is explicit and
   independent of `defaultLanguage`. The residual window (never configured + UI language changed) hides no
   data in storage. The read-side fallback is Sprint 3's decision; it is recorded in ROADMAP §3.

**VERDICT: APPROVED.** Both invariants hold. Proceed to the linear plan.

---

### Scope Gate

Follow-up planning run for a multi-sprint feature (`backlog/ROADMAP.md` present). Sprint 1 shipped
(`docs/Sprints/LocalizationCoreContracts/`, review PASS). This document is the detailed plan for
**Sprint 2 only**. The roadmap is updated, not rewritten: Sprint 1 is marked done, Sprint 2 is NEXT, and
the §2–§4 entries record the scope moves decided in the VETO audit above.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 taught the engine what a localized value is. Nothing can use that knowledge until two things exist:

1. **A project language configuration.** Without `locales` / `defaultLocale` there is no `LocaleConfig`
   to pass, so every localized branch still validates as its base type.
2. **Merge semantics on every write.** Validation returns a *patch*. Every write path except create writes a
   column wholesale. Wiring `localeConfig` without the merge would make the first single-language save
   erase every other translation.

The read path (Sprint 3) must come after this sprint: it resolves dictionaries that only this sprint
starts storing. The dashboard (Sprints 4–5) needs this sprint's `GET/PUT /api/settings` contract.

Invariant placement:
- **Botanical:** merge, legacy-value handling, required-locale rules and display resolution are pure
  functions in `@beechcms/core/engine/localization.ts`. `apps/api` loads configuration and calls them;
  it never interprets a dictionary itself.
- **VSA:** the one I/O helper shared by four slices lives in `apps/api/src/shared/localization/`. Every
  slice edit is local to that slice's own handler.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Middleware registration order** (`createBeechApp`, `factory.ts`), unchanged by this sprint:
1. `repositoryMiddleware` (L129). Injects `repository`, `siteSettingsRepository` (a `D1SiteSettingsRepository`
   built from `env.DB`), `idGenerator`, and the rest.
2. `seedRegistryMiddleware` (L143). Sets `getSeed`, `seedRegistry` (version-token cached per isolate).
3. `storageMiddleware` → `queueMiddleware` → `authProvidersMiddleware` → `rateLimiterMiddleware` →
   `observabilityMiddleware` → CORS → security headers → `/api/*` analytics.
4. Protected API (`/api`): `authMiddleware({ acceptOAuth: true })` → `oauthScopeMiddleware` →
   `permissionMiddleware`, then routes: `/settings` (L248), `/content` → `draftApp` (L256) and
   `contentFeature` (L258), `/automations` (L260).
5. Public API (`/api/v1/public`): `schemaRevisionMiddleware` → `publicRateLimitMiddleware` →
   `apiKeyMiddleware` → `publicRoutes` (`POST /:seed/add`, `PUT|PATCH /:seed/edit/:id`).

**Relevant `AppEnv.Variables`** (`types.ts`): `getSeed: (slug) => Seed | null` (L182),
`idGenerator: IIdGenerator` (L228), `siteSettingsRepository: ISiteSettingsRepository` (L240),
`repository: ContentRepository`, `jwtPayload`, `activityLogger`, `scheduler`, `automationRunner`.

**Settings** (`features/settings/settings.handler.ts`):
- `GET /` (`AUTHED`) maps `SiteSettings` to `{ siteTitle, siteLogo, defaultLanguage, timezone, currency, company, dateFormat, features }`.
- `PUT /` (`perm('manage_users', 'global')`, `permission.middleware.ts:L83`) trims known keys, validates
  `defaultLanguage ∈ {it, en}`, and answers `context.json({ type: 'bad-request', title, status: 400, detail }, 400)`
  on error. Then `setMany(fieldsToUpdate)`.
- `D1SiteSettingsRepository`: `getAll` does `SELECT key, value FROM site_settings` with `||` defaults.
  `setMany` does one upsert per key in a `batch` and binds `value ?? ''` (the table's `value` is NOT NULL).

**Write paths and what each does with a localized value today** (config never passed):

| Path | File | Stored value today | This sprint |
|------|------|--------------------|-------------|
| Content create | `features/content/handlers/create.ts:L74` | base-type validation; dictionary rejected | config + compact merge + display resolve |
| Content update | `features/content/handlers/update.ts:L113` | reads `current` (L73), writes column wholesale | config + merge vs `current` + implicit OCC |
| Kanban move | `features/content/handlers/kanban-move.ts:L72` | writes axis value over column | localized axes excluded in core |
| Bulk edit | `features/content/handlers/bulk.handler.ts:L147` | raw `set` → `serializeForDb`, no validation | refuse localized fields |
| Draft save | `features/draft/draft.handler.ts:L101` | writes touched columns; publish copies them to live | config + merge vs draft-or-live |
| Import (queue) | `features/content/jobs/import-chunk.worker.ts:L154` | base-type validation; exported dictionaries fail re-import | config + compact merge + slug resolve |
| Public add | `public/public-add.ts:L314` via `sanitize.ts` | base-type validation | config + compact merge + display resolve |
| Public edit | `public/public-edit.ts:L148` via `sanitize.ts` | reads `entry` (L201), writes wholesale | config + merge vs `entry` + implicit OCC + 409 mapping |
| Automation `edit_field` | `features/automations/executors/edit-field.executor.ts:L25` | raw write, no validation | refuse localized target |
| Automation `create_entry` | `executors/create-entry.executor.ts:L26` | copies source values into a *new* entry | unchanged (new entry: nothing to lose) |
| Rotate field | `features/rotate-field/rotate-field.handler.ts:L108` | confidential branches only | unchanged (Fatal 17 forbids localized + confidential) |

**Repository behaviour relied upon (not modified):** `update()` re-reads the row, skips keys whose
`JSON.stringify` is unchanged, and applies `AND updated_at = ?` when `options.ifMatch` is set, then throws
`EntryConflictError` (`L637`, `L654`). `saveDraft()` upserts only the columns present in `data` and unions
`_touched_fields`. `getDraft()` returns touched columns, plus untouched ones that are non-null. `publishDraft()`
copies touched columns and refuses with `DraftConflictError` when live moved past `live_snapshot_at`.

**Required-field semantics** (`validation/index.ts:L158`, `detectMissingRequired`): for the active
operation, a required alias absent from the payload is `missing`. When present, an effectively empty value is
`empty`. Sprint 1 made the localized candidate `toLocalizedPatch(value)[defaultLocale]`.

**Display / slug fallbacks that stringify a branch value:** `create.ts:L111,L121`, `update.ts:L170`,
`draft.handler.ts:L131`, `import-chunk.worker.ts:L178`, `public-add.ts:L30-37 (pickSlug), L395-399`,
`public-edit.ts:L235-238`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Production code:

| # | File | Change |
|---|------|--------|
| 1 | `packages/core/src/engine/localization.ts` | MODIFY — add `LocaleSettings`, `resolveLocaleConfig`, `applyLocalizedPatch`, `localizedAliasesIn`, `mergeLocalizedFields`, `resolveLocalizedValue`, `resolveLocalizedFields` (+ private `isStoredLocaleDictionary`) |
| 2 | `packages/core/src/engine/validation/index.ts` | MODIFY — `detectMissingRequired`: untouched default locale on `update` |
| 3 | `packages/core/src/settings/site-settings.repository.ts` | MODIFY — `SiteSettings.locales`, `SiteSettings.defaultLocale` |
| 4 | `packages/core/src/dashboard-layout/kanban/kanban.ts` | MODIFY — `isAxisCandidate` rejects localized branches |
| 5 | `apps/api/src/shared/localization/locale-config.ts` | NEW — `loadLocaleConfig()` |
| 6 | `apps/api/src/shared/db/repositories/site-settings.repository.d1.ts` | MODIFY — parse/serialize `locales`, `defaultLocale` |
| 7 | `apps/api/src/features/settings/settings.handler.ts` | MODIFY — `GET /` exposes, `PUT /` validates + persists |
| 8 | `apps/api/src/features/content/handlers/create.ts` | MODIFY — config, merge, display resolve |
| 9 | `apps/api/src/features/content/handlers/update.ts` | MODIFY — config, merge, implicit OCC, display resolve |
| 10 | `apps/api/src/features/content/handlers/bulk.handler.ts` | MODIFY — refuse localized fields |
| 11 | `apps/api/src/features/content/jobs/import-chunk.worker.ts` | MODIFY — config, merge, slug resolve |
| 12 | `apps/api/src/features/draft/draft.handler.ts` | MODIFY — config, merge vs draft-or-live, display resolve |
| 13 | `apps/api/src/features/automations/executors/edit-field.executor.ts` | MODIFY — refuse localized target |
| 14 | `apps/api/src/public/sanitize.ts` | MODIFY — `localeConfig` option passthrough |
| 15 | `apps/api/src/public/public-add.ts` | MODIFY — config, merge, display/slug resolve |
| 16 | `apps/api/src/public/public-edit.ts` | MODIFY — config, merge, implicit OCC, 409 mapping, display resolve |

Tests:

| # | File | Tier |
|---|------|------|
| T1 | `packages/core/src/engine/localization.test.ts` | unit (extend) |
| T2 | `packages/core/src/engine/validation/localized-schema.test.ts` | unit (extend) |
| T3 | `packages/core/src/dashboard-layout/kanban/kanban.test.ts` | unit (extend) |
| T4 | `apps/api/src/shared/localization/locale-config.test.ts` | unit (NEW) |
| T5 | `apps/api/src/shared/db/repositories/site-settings.repository.d1.test.ts` | unit (extend) |
| T6 | `apps/api/src/features/content/handlers/update.test.ts` | unit (NEW) |
| T7 | `apps/api/src/features/automations/executors/action-executors.test.ts` | unit (extend) |
| T8 | `apps/api/src/features/content/jobs/import-chunk.worker.test.ts` | unit (extend) |
| T9 | `apps/api/src/features/settings/test/integration/settings-locales.integration.test.ts` | integration (NEW, real D1) |
| T10 | `apps/api/src/features/content/test/integration/content-localization.integration.test.ts` | integration (NEW, real D1) |
| T11 | `apps/api/src/features/draft/test/integration/draft-localization.integration.test.ts` | integration (NEW, real D1) |
| T12 | `apps/api/src/public/test/integration/public-localization-write.integration.test.ts` | integration (NEW, real D1) |

Explicitly **not** produced: any migration, any change to `D1ContentRepository`, `serialize.ts`, `query.ts`,
`factory.ts`, `types.ts`, middleware, kanban-move handler, read handlers, dashboard, SDKs or docs (SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Headers: `packages/core` files use the two-line MIT header; `apps/api` files use the three-line BUSL header.
Single quotes, no semicolons (match surrounding files). Problem `type`s rendered through `publicProblem`
arrive as `https://beechcms.dev/problems/<type>`; settings errors are raw `context.json` (file's existing idiom).

### Task 1 — core localization (`packages/core/src/engine/localization.ts`)

Change the type import to `import type { Branch, BranchType, Seed } from './types.js'`. Append after
`compactLocalizedDictionary`:

```ts
/**
 * The settings subset {@link resolveLocaleConfig} reads. Structural, so this module stays free of
 * settings imports; `SiteSettings` satisfies it.
 */
export interface LocaleSettings {
  readonly locales?: readonly string[] | null
  readonly defaultLocale?: string | null
  readonly defaultLanguage: string
}

/** Content locale used when neither stored `locales` nor a valid `defaultLanguage` is available. */
const FALLBACK_LOCALE = 'en'

/**
 * Builds the project's {@link LocaleConfig}, repairing whatever a hand-edited settings row could break so
 * the LocaleConfig invariant always holds:
 * - `locales`: the stored list minus invalid codes and duplicates; when nothing remains (never configured,
 *   `[]`, corrupt), the implicit single-language config `[defaultLanguage]` (brief §2), which keeps the
 *   feature invisible to a mono-lingual project;
 * - `defaultLocale`: the stored value when it belongs to `locales`, else `locales[0]`.
 */
export function resolveLocaleConfig(settings: LocaleSettings): LocaleConfig {
  const stored = [...new Set((settings.locales ?? []).filter(isLocaleCode))]
  const implicit = isLocaleCode(settings.defaultLanguage) ? settings.defaultLanguage : FALLBACK_LOCALE
  const locales = stored.length > 0 ? stored : [implicit]
  const defaultLocale = settings.defaultLocale && locales.includes(settings.defaultLocale)
    ? settings.defaultLocale
    : locales[0]
  return { locales, defaultLocale }
}

/**
 * True when a STORED value of a localized branch is a locale dictionary. Text and richtext cannot hold an
 * object keyed only by locale codes for any other reason; json can (`{"url": "…", "alt": "…"}`), so a json
 * object counts only when at least one key is a registered locale — otherwise it is a legacy value written
 * before the branch became localized.
 */
function isStoredLocaleDictionary(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  config: LocaleConfig,
): value is LocalizedDictionary {
  if (!isLocalizedBranch(branch) || !isLocaleDictionary(value)) return false
  return branch.type !== 'json' || Object.keys(value).some((key) => config.locales.includes(key))
}

/**
 * Merges a write into the value stored for a localized branch. The write path's only way to persist a
 * localized value, so a translation the write does not mention is never dropped (brief §2):
 * - `write === null` clears the whole field (an explicit null keeps its pre-localization meaning);
 * - otherwise the write is normalised with {@link toLocalizedPatch}: every registered locale it names
 *   overwrites that locale, a `null` entry clears that locale only, and every other stored locale —
 *   including ones no longer registered — is kept as-is;
 * - a stored legacy value (written before the branch became localized) is the default-locale value.
 * @returns The compacted dictionary, or `null` when no locale keeps a value.
 */
export function applyLocalizedPatch(
  branch: Pick<Branch, 'type' | 'localized'>,
  stored: unknown,
  write: unknown,
  config: LocaleConfig,
): LocalizedDictionary | null {
  if (write === null) return null
  const merged: LocalizedDictionary = isStoredLocaleDictionary(branch, stored, config)
    ? { ...stored }
    : isBlankLocaleValue(stored) ? {} : { [config.defaultLocale]: stored }
  Object.assign(merged, toLocalizedPatch(write, config))
  return compactLocalizedDictionary(merged)
}

/** Aliases of the localized branches a write carries — the fields it must merge rather than replace. */
export function localizedAliasesIn(seed: Pick<Seed, 'branches'>, data: Record<string, unknown>): string[] {
  return seed.branches
    .filter((branch) => isLocalizedBranch(branch) && Object.hasOwn(data, branch.alias) && data[branch.alias] !== undefined)
    .map((branch) => branch.alias)
}

/**
 * Returns `data` with every localized branch it carries merged into `stored` via
 * {@link applyLocalizedPatch}; other keys pass through untouched. `stored` is the entry's current values
 * (`null` on create, which only compacts). Returns `data` itself when `config` is undefined or no localized
 * branch is written.
 */
export function mergeLocalizedFields(
  seed: Pick<Seed, 'branches'>,
  stored: Record<string, unknown> | null,
  data: Record<string, unknown>,
  config: LocaleConfig | undefined,
): Record<string, unknown> {
  if (!config) return data
  const aliases = localizedAliasesIn(seed, data)
  if (aliases.length === 0) return data
  const merged: Record<string, unknown> = { ...data }
  for (const branch of seed.branches) {
    if (!aliases.includes(branch.alias)) continue
    merged[branch.alias] = applyLocalizedPatch(branch, stored?.[branch.alias], data[branch.alias], config)
  }
  return merged
}

/**
 * Resolves a stored localized value to one language: the requested locale, then the default locale, then
 * — for a legacy value that is not a dictionary — the raw value itself. Returns `null` when a dictionary
 * has neither locale. Non-localized branches return `value` unchanged.
 */
export function resolveLocalizedValue(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  locale: string,
  config: LocaleConfig,
): unknown {
  if (!isStoredLocaleDictionary(branch, value, config)) return value
  if (!isBlankLocaleValue(value[locale])) return value[locale]
  const fallback = value[config.defaultLocale]
  return isBlankLocaleValue(fallback) ? null : fallback
}

/**
 * Returns a copy of `data` with every localized branch resolved to `locale` (default: the default locale)
 * via {@link resolveLocalizedValue}. Returns `data` itself when `config` is undefined.
 */
export function resolveLocalizedFields(
  seed: Pick<Seed, 'branches'>,
  data: Record<string, unknown>,
  config: LocaleConfig | undefined,
  locale?: string,
): Record<string, unknown> {
  if (!config) return data
  const target = locale ?? config.defaultLocale
  const resolved: Record<string, unknown> = { ...data }
  for (const branch of seed.branches) {
    if (isLocalizedBranch(branch) && Object.hasOwn(resolved, branch.alias)) {
      resolved[branch.alias] = resolveLocalizedValue(branch, resolved[branch.alias], target, config)
    }
  }
  return resolved
}
```

No barrel change: `index.ts` already has `export * from './engine/localization.js'`. Name-collision check
(executor re-runs): `grep -rn "resolveLocaleConfig\|applyLocalizedPatch\|mergeLocalizedFields\|resolveLocalizedValue\|resolveLocalizedFields\|localizedAliasesIn\|LocaleSettings" packages apps --include=*.ts`
→ 0 hits outside this file before the change.

### Task 2 — required check on update (`packages/core/src/engine/validation/index.ts`)

In `detectMissingRequired`, replace the Sprint 1 block:

```ts
    const value = parseSucceeded ? parsedData[branch.alias] : filtered[branch.alias]
    // A localized branch is present when its default locale is; other locales are optional (brief §4).
    const candidate = options.localeConfig && isLocalizedBranch(branch)
      ? toLocalizedPatch(value, options.localeConfig)[options.localeConfig.defaultLocale]
      : value
```
with:
```ts
    const value = parseSucceeded ? parsedData[branch.alias] : filtered[branch.alias]
    let candidate = value
    if (options.localeConfig && isLocalizedBranch(branch)) {
      // A localized branch is present when its default locale is; other locales are optional (brief §4).
      const { defaultLocale } = options.localeConfig
      const patch = toLocalizedPatch(value, options.localeConfig)
      // An update that does not name the default locale leaves it as stored — the write path merges
      // (applyLocalizedPatch) — so saving one translation cannot trip requiredOnUpdate.
      if (op === 'update' && !Object.hasOwn(patch, defaultLocale)) continue
      candidate = patch[defaultLocale]
    }
```
(`null` and blank inputs normalise to `{ [defaultLocale]: null }`, so an explicit clear is still `empty`.)

### Task 3 — `SiteSettings` (`packages/core/src/settings/site-settings.repository.ts`)

Add after `companyAbbreviation`:
```ts
  /**
   * Content locales for field-level localization, in display order. `null` = never configured
   * (resolveLocaleConfig then falls back to `[defaultLanguage]`). Distinct from `defaultLanguage`,
   * which is the dashboard UI language.
   */
  locales: string[] | null
  /** Default content locale. `null` = never configured. */
  defaultLocale: string | null
```

### Task 4 — kanban axis (`packages/core/src/dashboard-layout/kanban/kanban.ts`)

Add `import { isLocalizedBranch } from '../../engine/localization.js'`. In `isAxisCandidate`, after the
`status` guard:
```ts
  // A localized value is a locale dictionary, not one discrete column value, and a card move would
  // overwrite every translation with the column value.
  if (isLocalizedBranch(b)) return null
```

### Task 5 — `loadLocaleConfig` (`apps/api/src/shared/localization/locale-config.ts`, NEW)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { isLocalizedBranch, resolveLocaleConfig } from '@beechcms/core'
import type { ISiteSettingsRepository, LocaleConfig, Seed } from '@beechcms/core'

/**
 * Loads the project's LocaleConfig for a write on `seed`, or `undefined` when the seed has no localized
 * branch — the only case where the config changes validation — so non-localized seeds pay no D1 read.
 * Deliberately uncached: an isolate cache invalidated on settings PUT would stay stale in every other
 * isolate, and writes can afford one small read.
 */
export async function loadLocaleConfig(
  repository: Pick<ISiteSettingsRepository, 'getAll'>,
  seed: Pick<Seed, 'branches'>,
): Promise<LocaleConfig | undefined> {
  if (!seed.branches.some(isLocalizedBranch)) return undefined
  return resolveLocaleConfig(await repository.getAll())
}
```

### Task 6 — settings repository (`apps/api/src/shared/db/repositories/site-settings.repository.d1.ts`)

- `DEFAULTS`: add `locales: null, defaultLocale: null`.
- Module-level helper:
```ts
/** A malformed stored array reads as "never configured" — resolveLocaleConfig then falls back safely. */
function parseLocales(raw: string | undefined): string[] | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.every((code) => typeof code === 'string') ? parsed : null
  } catch {
    return null
  }
}
```
- `getAll` return: add `locales: parseLocales(map.get('locales')),` and `defaultLocale: map.get('defaultLocale') || null,`.
- `setMany`: replace the `entries` line and bind with:
```ts
    const entries = Object.entries(values).filter(([, v]) => v !== undefined) as [string, string | string[] | null][]
    ...
        .bind(key, Array.isArray(value) ? JSON.stringify(value) : (value ?? '')),
```

### Task 7 — settings routes (`apps/api/src/features/settings/settings.handler.ts`)

Imports: add `isLocaleCode, resolveLocaleConfig` to the `@beechcms/core` import. Constant:
```ts
/** Upper bound on content locales: each localized value holds one validated value per locale. */
const MAX_LOCALES = 50
```

`GET /` — after `const s = …`: `const localeConfig = resolveLocaleConfig(s)`; add to the response, after
`defaultLanguage`:
```ts
    locales: localeConfig.locales,
    defaultLocale: localeConfig.defaultLocale,
```

`PUT /` — after the `companyWebsite` URL check, before `fieldsToUpdate` is built:
```ts
  const hasLocales = payload.locales !== undefined
  const hasDefaultLocale = payload.defaultLocale !== undefined
  let nextLocales: string[] | undefined
  let nextDefaultLocale: string | undefined
  if (hasLocales || hasDefaultLocale) {
    const localesInput = payload.locales
    if (hasLocales && (
      !Array.isArray(localesInput) || localesInput.length === 0 || localesInput.length > MAX_LOCALES ||
      !localesInput.every(isLocaleCode) || new Set(localesInput).size !== localesInput.length
    )) {
      return context.json({ type: 'settings-invalid-locales', title: 'Bad Request', status: 400, detail: `locales must be 1–${MAX_LOCALES} distinct locale codes (e.g. "it", "pt-BR")` }, 400)
    }
    if (hasDefaultLocale && !isLocaleCode(payload.defaultLocale)) {
      return context.json({ type: 'settings-invalid-default-locale', title: 'Bad Request', status: 400, detail: 'defaultLocale must be a locale code (e.g. "it", "pt-BR")' }, 400)
    }
    const current = resolveLocaleConfig(await context.get('siteSettingsRepository').getAll())
    nextLocales = hasLocales ? (localesInput as string[]) : [...current.locales]
    nextDefaultLocale = hasDefaultLocale ? (payload.defaultLocale as string) : current.defaultLocale
    if (!nextLocales.includes(nextDefaultLocale)) {
      return context.json({ type: 'settings-default-locale-not-in-locales', title: 'Bad Request', status: 400, detail: `defaultLocale '${nextDefaultLocale}' must be one of locales` }, 400)
    }
  }
```
After the existing `fieldsToUpdate` assignments:
```ts
  // Both keys are persisted together so, once configured, content locales no longer follow the dashboard
  // UI language (defaultLanguage). Removing a locale only rewrites this setting: stored translations in
  // that locale stay in their dictionaries (brief §2, no data loss).
  if (nextLocales !== undefined && nextDefaultLocale !== undefined) {
    fieldsToUpdate.locales = nextLocales
    fieldsToUpdate.defaultLocale = nextDefaultLocale
  }
```
All validation runs before `setMany`, so a refused PUT writes nothing, including sibling keys.

### Task 8 — content create (`apps/api/src/features/content/handlers/create.ts`)

- Imports: add `mergeLocalizedFields, resolveLocalizedFields` to `@beechcms/core`; add
  `import { loadLocaleConfig } from '../../../shared/localization/locale-config'`.
- Before `validateAndSanitizeSeedPayload`:
  `const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)`; pass
  `localeConfig,` in the options object.
- After the `applyPrivacy` try/catch:
```ts
  // Compacts each localized patch into the dictionary that is stored (null entries dropped), so the
  // automation payload below carries exactly what was persisted.
  privacyData = mergeLocalizedFields(seed, null, privacyData, localeConfig)
  // Slug and activity title need one string per field, never a dictionary ("object-object").
  const displayData = resolveLocalizedFields(seed, privacyData, localeConfig)
```
- Replace `privacyData` with `displayData` in the slug fallback (L111) and in the `title` line (L121) only.
  `repository.create` and `dispatchContentAutomation` keep `privacyData`.

### Task 9 — content update (`apps/api/src/features/content/handlers/update.ts`)

- Imports: add `localizedAliasesIn, mergeLocalizedFields, resolveLocalizedFields` and `loadLocaleConfig` (as Task 8).
- Before `const mergedData = …`: `const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)`
  and `let mergesLocalized = false`.
- Pass `localeConfig,` to `validateAndSanitizeSeedPayload`.
- Replace the copy loop after `applyPrivacy` with:
```ts
      mergesLocalized = localeConfig !== undefined && localizedAliasesIn(seed, privacyPatch).length > 0
      // A localized field is merged into its stored dictionary, never replaced: translations this
      // request does not mention survive (brief §2).
      const patch = mergeLocalizedFields(seed, current, privacyPatch, localeConfig)
      // Pass null values to patch (patch semantics: null = clear field)
      for (const [k, v] of Object.entries(patch)) {
        if (v !== undefined) mergedData[k] = v
      }
```
- Replace the `repository.update` call with:
```ts
    // The merge above is read-modify-write against `current`: without a version guard a concurrent write
    // landing in between would lose its translation silently. Fall back to the version we merged against
    // when the client sent none, turning that race into the usual 409.
    const guard = ifMatch ?? (mergesLocalized ? (current.updated_at as number) : undefined)
    await repository.update(seed, id, mergedData, newStatus, { actor, ifMatch: guard })
```
- Title line: `const displayData = resolveLocalizedFields(seed, mergedData, localeConfig)` then
  `const title = displayData.title || displayData.name || newSlug`.

### Task 10 — bulk (`apps/api/src/features/content/handlers/bulk.handler.ts`)

Import `isLocalizedBranch` from `@beechcms/core`. Right after the `policies.visibility / privacy` refusal:
```ts
    // Bulk writes are blind per-row UPDATEs: a value here would replace every stored translation.
    if (isLocalizedBranch(branch)) {
      return publicProblem(context, {
        type: 'field-not-bulk-editable',
        title: 'Bad Request',
        status: 400,
        detail: `Field '${alias}' is localized and cannot be bulk-edited`,
      })
    }
```

### Task 11 — import worker (`apps/api/src/features/content/jobs/import-chunk.worker.ts`)

- Imports: add `mergeLocalizedFields, resolveLocalizedFields` to `@beechcms/core`; add
  `import { D1SiteSettingsRepository } from '../../../shared/db/repositories/site-settings.repository.d1'` and
  `import { loadLocaleConfig } from '../../../shared/localization/locale-config'`.
- After the `unsupportedBranch` block (once per chunk, outside `processRecord`):
  `const localeConfig = await loadLocaleConfig(new D1SiteSettingsRepository(db), targetSeed)`.
- In `processRecord`: pass `localeConfig,` to `validateAndSanitizeSeedPayload`; after the `details` guard:
```ts
      const data = mergeLocalizedFields(targetSeed, null, validation.data, localeConfig)
      const displayData = resolveLocalizedFields(targetSeed, data, localeConfig)
```
  The slug fallback reads `displayData[targetSeed.displayNameAlias]`, and `repository.create` receives `data`.
  Net effect: an exported dictionary (`{"it":"…","en":"…"}`) re-imports as a dictionary.

### Task 12 — draft save (`apps/api/src/features/draft/draft.handler.ts`)

- Imports: add `localizedAliasesIn, mergeLocalizedFields, resolveLocalizedFields` to `@beechcms/core`;
  add `import { loadLocaleConfig } from '../../shared/localization/locale-config'`.
- `PUT /:slug/:id/draft`: before validation,
  `const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)`; pass it.
- Replace `await repository.saveDraft(seed, id, validation.data)` and the `displayTitle` line with:
```ts
  const repository = context.get('repository')
  let draftData = validation.data
  if (localeConfig && localizedAliasesIn(seed, validation.data).length > 0) {
    // publishDraft copies each touched column over the live row, so the draft must hold the complete
    // dictionary: base it on the pending draft value when this field was already drafted, else on live.
    const [pending, live] = await Promise.all([repository.getDraft(seed, id), repository.findById(seed, id)])
    draftData = mergeLocalizedFields(seed, { ...live, ...(pending ?? {}) }, validation.data, localeConfig)
  }
  await repository.saveDraft(seed, id, draftData)

  const displayData = resolveLocalizedFields(seed, draftData, localeConfig)
  const displayTitle = cleanStr(displayData[seed.displayNameAlias]) ?? id
```
(`draftGuard` has already proven the live entry exists.)

### Task 13 — automation `edit_field` (`apps/api/src/features/automations/executors/edit-field.executor.ts`)

Import `isLocalizedBranch` (value import) alongside the existing type imports. Before the `resolved` computation:
```ts
  const branch = seed.branches.find((b) => b.alias === action.field)
  // The executor writes raw values with no validation or locale config: on a localized field that would
  // replace every stored translation. Refused until automations can merge per locale.
  if (branch && isLocalizedBranch(branch)) {
    throw new Error(`edit_field: field '${action.field}' is localized and cannot be set by an automation`)
  }
```

### Task 14 — public sanitize (`apps/api/src/public/sanitize.ts`)

Add `type LocaleConfig` to the `@beechcms/core` type import; add `localeConfig?: LocaleConfig` to the
`options` parameter type; pass `localeConfig: options.localeConfig,` into `validateAndSanitizeSeedPayload`.

### Task 15 — public add (`apps/api/src/public/public-add.ts`)

- Imports: add `mergeLocalizedFields, resolveLocalizedFields` to `@beechcms/core`; add `loadLocaleConfig`
  (`'../shared/localization/locale-config'`).
- Before the `sanitizePublicPayload` call (L314):
  `const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)`; pass
  `localeConfig` in its options.
- After the `applyPrivacy` try/catch:
```ts
  privacyData = mergeLocalizedFields(seed, null, privacyData, localeConfig)
  const displayData = resolveLocalizedFields(seed, privacyData, localeConfig)
```
- `pickSlug(body, displayData)` instead of `pickSlug(body, privacyData)`. The notification `safeTitle` /
  `safeName` read from `displayData`. `repository.create` keeps `privacyData`. The idempotency fingerprint
  and response echo keep `sanitized.data` (unchanged contract; public response shape is Sprint 3).

### Task 16 — public edit (`apps/api/src/public/public-edit.ts`)

- Imports: add `EntryConflictError, localizedAliasesIn, mergeLocalizedFields, resolveLocalizedFields` to
  `@beechcms/core`; add `type LocaleConfig` to the type import; add `loadLocaleConfig`.
- `resolveData(context, seed, body, localeConfig: LocaleConfig | undefined)`: pass `localeConfig` to
  `sanitizePublicPayload`.
- In `publicEditHandler`, after `const entry = …`:
  `const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)`; pass it to `resolveData`.
- Replace `const updateData = { ...dataResult.value }` with:
```ts
    // Merged into the stored dictionaries so translations the caller does not mention survive (brief §2).
    const updateData: Record<string, unknown> = { ...mergeLocalizedFields(seed, entry, dataResult.value, localeConfig) }
```
  and the `repository.update` call with:
```ts
    // Read-modify-write against `entry`: guard with the version merged against so a concurrent write
    // yields 409 instead of silently losing a translation.
    const ifMatch = localeConfig && localizedAliasesIn(seed, dataResult.value).length > 0
      ? (entry.updated_at as number)
      : undefined
    await repository.update(seed, id, updateData, statusResult.value, { ifMatch })
```
- Title: `const displayEntry = resolveLocalizedFields(seed, updatedEntry, localeConfig)` and read
  `safeTitle` / `safeName` from `displayEntry`.
- In `catch`, before the `EntryNotFoundError` branch:
```ts
    if (error instanceof EntryConflictError) {
      return publicProblem(context, { type: 'entry-update-conflict', title: 'Conflict', status: 409, detail: `Entry '${id}' was modified concurrently. Re-read it and retry.` })
    }
```

### Task 17 — tests

Conventions: `_config/testing_conventions.md`. Four zones, one act, no `should`, no `any`, fresh state per
test. Core suites use the `CONFIG` literal already in `localization.test.ts`
(`{ locales: ['it', 'en', 'pt-BR'], defaultLocale: 'it' }`) and hand-rolled branches, as Sprint 1 did.
Integration suites provision seeds through the Seeds API (`POST /api/seeds`, a hand-rolled *definition* is
the input under test, as in `seed-localization.integration.test.ts`), configure languages through
`PUT /api/settings`, write through the real routes, and read raw state through
`SELECT <alias> FROM content_<slug>` (Rule 3.7 idiom already used by Sprint 1). Branch ids are read back,
never hardcoded. Every write test asserts persisted state (Rule 5.5); every refusal asserts nothing changed (Rule 5.6).

**T1 — `localization.test.ts`** (extend; one `describe` per new export):
- `resolveLocaleConfig`:
  - `falls back to [defaultLanguage] when locales were never configured` — `{ locales: null, defaultLocale: null, defaultLanguage: 'it' }` → `{ locales: ['it'], defaultLocale: 'it' }`.
  - `drops invalid and duplicate codes and repairs a defaultLocale outside locales` — `{ locales: ['it', 'IT', 'en', 'it'], defaultLocale: 'de', defaultLanguage: 'en' }` → `{ locales: ['it', 'en'], defaultLocale: 'it' }`.
  - `keeps a configured list and default` — `{ locales: ['en', 'it'], defaultLocale: 'it', … }` → unchanged.
- `applyLocalizedPatch` (text branch unless stated):
  - `merges a locale into the stored dictionary and keeps the others` — stored `{ it: 'Scarpa' }`, write `{ en: 'Shoe' }` → `{ it: 'Scarpa', en: 'Shoe' }`.
  - `clears one locale on a null entry` — stored `{ it: 'Scarpa', en: 'Shoe' }`, write `{ en: null }` → `{ it: 'Scarpa' }`.
  - `treats a legacy plain value as the default locale` — stored `'Scarpa'`, write `{ en: 'Shoe' }` → `{ it: 'Scarpa', en: 'Shoe' }`.
  - `keeps a locale no longer registered` — stored `{ it: 'a', de: 'b' }`, write `'c'` → `{ it: 'c', de: 'b' }`. **Regression guard comment** (Rule 6.2.4): removing a locale from settings must never drop its stored translations.
  - `wraps a legacy json object under the default locale instead of merging into it` — json branch, stored `{ url: 'u', alt: 'a' }`, write `{ en: { url: 'v' } }` → `{ it: { url: 'u', alt: 'a' }, en: { url: 'v' } }`. **Regression guard comment**: grammar-matching json keys are not locales.
  - `returns null when the write clears the last locale` and `returns null for an explicit null write`.
- `localizedAliasesIn`: `lists only localized branches present with a defined value`.
- `mergeLocalizedFields`:
  - `merges localized aliases and passes other keys through` — `{ title: { en: 'Shoe' }, code: 'X1' }` over stored `{ title: { it: 'Scarpa' }, code: 'X0' }` → `{ title: { it: 'Scarpa', en: 'Shoe' }, code: 'X1' }`.
  - `returns the same object when no config is passed` (`toBe`).
- `resolveLocalizedValue`: matrix (Rule 1.6) over `{ it: 'Scarpa', en: 'Shoe' }` / `'en'` → `'Shoe'`; `{ it: 'Scarpa' }` / `'en'` → `'Scarpa'`; `{ it: 'Scarpa', en: '' }` / `'en'` → `'Scarpa'`; `'Legacy'` / `'en'` → `'Legacy'`; `{ de: 'Schuh' }` / `'en'` → `null`.
- `resolveLocalizedFields`: `resolves localized fields to the default locale and leaves others untouched`.

**T2 — `validation/localized-schema.test.ts`** (extend; add `summary` text branch `localized: true, requiredOnUpdate: true` to a local seed in the new tests only):
- `satisfies requiredOnUpdate with an update that leaves the default locale untouched` — `operation: 'update'`, `{ summary: { en: 'Shoe' } }` → `requiredFieldsMissing` `[]`.
- `reports requiredOnUpdate when an update clears the default locale` — `{ summary: { it: '' } }` → `requiredFieldsMissing` equals `['summary']`.
- `still reports requiredOnCreate when only a non-default locale is provided` stays covered by the existing Sprint 1 test (no change).

**T3 — `kanban.test.ts`** (extend `describe('resolveKanbanConfig')`):
- `excludes a localized text branch with options` — seed with only `{ type: 'text', options: ['a','b'], localized: true }` → `{ compatible: false, reason: 'no-candidate-branch' }`.

**T4 — `shared/localization/locale-config.test.ts`** (NEW, unit):
- `returns undefined without reading settings for a seed with no localized branch` — `getAll: vi.fn()`; result `undefined`, `getAll` not called (the subject IS the read avoidance; Rule 5.8 exception).
- `resolves the stored configuration for a seed with a localized branch` — `getAll` resolves `{ …, locales: ['it','en'], defaultLocale: 'en', defaultLanguage: 'it' }` → `{ locales: ['it','en'], defaultLocale: 'en' }`.
Build the stub as `Pick<ISiteSettingsRepository, 'getAll'>`; full `SiteSettings` literal (typed, no `any`).

**T5 — `site-settings.repository.d1.test.ts`** (extend):
- Update `returns default values when site_settings table is empty` to include `locales: null, defaultLocale: null` (contract change of `SiteSettings`, stated in the PR).
- `parses the stored locales array and defaultLocale` — rows `{ key: 'locales', value: '["it","en"]' }`, `{ key: 'defaultLocale', value: 'en' }`.
- `reads a malformed locales value as null` — value `'not-json'` → `locales` `null`.
- `JSON-encodes the locales array on write` — `setMany({ locales: ['it','en'] })` → `bind` called with `('locales', '["it","en"]')`.

**T6 — `features/content/handlers/update.test.ts`** (NEW, unit; template: `kanban-move.test.ts` context stub, typed, no `any`):
Seed `articles`: `title` (text, `localized: true`), `code` (text). `siteSettingsRepository.getAll` resolves
`locales: ['it','en'], defaultLocale: 'it'`. `repository.findById` resolves `{ id, slug: 'a', status: 'draft', updated_at: 1700000000, title: { it: 'Scarpa' }, code: 'X' }`.
- `merges a localized write into the stored dictionary and guards it with the stored updated_at` — body `{ title: { en: 'Shoe' } }`, no If-Match → `repository.update` called with `mergedData` `{ title: { it: 'Scarpa', en: 'Shoe' } }` and options `{ ifMatch: 1700000000 }` (`toMatchObject`). **Regression guard comment**: the read-modify-write race.
- `keeps the client If-Match over the implicit guard` — `If-Match: "1699999999"` → `ifMatch: 1699999999`.
- `adds no implicit guard to a write that touches no localized branch` — body `{ code: 'Y' }` → `ifMatch: undefined`.

**T7 — `action-executors.test.ts`** (extend `describe('edit_field executor')`):
- `rejects a localized target and never writes` — `seed.branches` contains `{ alias: 'title', type: 'text', localized: true }`; `executeAction({ type: 'edit_field', field: 'title', value: 'x' }, ctx)` rejects with `/localized/`; `repository.update` not called.

**T8 — `import-chunk.worker.test.ts`** (extend): parametrise `createSeedDb(target: Seed = TARGET_SEED, settingsRows: Array<{ key: string; value: string }> = [])`. `prepare` also returns `all: async () => ({ results: settingsRows })`, and `buildContext` gains an optional `targetSeed` / `settingsRows`.
- `imports a localized dictionary row keeping registered locales and derives the slug from the default locale` — target seed `title` `localized: true`; settings rows `locales = '["it","en"]'`, `defaultLocale = 'it'`; body `{"title":{"it":"Scarpa","en":"Shoe"}}\n` → inserted row `title` `toEqual({ it: 'Scarpa', en: 'Shoe' })` and `slug` `'scarpa'`. **Regression guard comment**: export → import round-trip of localized content.

**T9 — `settings-locales.integration.test.ts`** (NEW; `describe('settings slice — locales (real D1)')`, harness per §9.1, `admin`):
- `describe('GET /api/settings')`
  - `exposes the implicit single-language config when languages were never configured` — `200`; `locales` equals `[defaultLanguage]` and `defaultLocale` equals `defaultLanguage` (read both from the same body).
- `describe('PUT /api/settings')`
  - `persists locales and defaultLocale` — PUT `{ locales: ['it','en'], defaultLocale: 'it' }` → `200`; GET → `{ locales: ['it','en'], defaultLocale: 'it' }`; `SELECT value FROM site_settings WHERE key = 'locales'` → `'["it","en"]'`.
  - `refuses malformed locales with 400 settings-invalid-locales and stores nothing` — matrix: `[]`, `['it','it']`, `['IT']`, `'it'`, 51 generated distinct codes (build from `aa`…; comment the 50 bound). Per case `400`, `type` `'settings-invalid-locales'`, and `SELECT COUNT(*) FROM site_settings WHERE key = 'locales'` stays `0`.
  - `refuses a defaultLocale outside locales with 400 settings-default-locale-not-in-locales` — PUT `{ locales: ['it','en'], defaultLocale: 'fr' }` → `400`, no `locales` row.
  - `removing a locale leaves stored translations untouched` — ARRANGE: create seed `loc_settings` (`title` text `localized: true`, `requiredOnCreate`) via Seeds API; PUT locales `['it','en']` / `it`; POST content `{ title: { it: 'Scarpa', en: 'Shoe' }, slug: 'scarpa' }` (assert `201`, precondition). ACT: PUT `{ locales: ['it'] }`. ASSERT: `200`; raw `SELECT title FROM content_loc_settings WHERE slug = 'scarpa'` parses to `{ it: 'Scarpa', en: 'Shoe' }`.

**T10 — `content-localization.integration.test.ts`** (NEW; `describe('content slice — localization (real D1)')`).
Local helper `provision(slug, branches)` declared inside the `describe` (Rule 3.12): `POST /api/seeds` then
`PUT /api/settings { locales: ['it','en'], defaultLocale: 'it' }`. Local `rawTitle(slug, entrySlug)` →
`JSON.parse` of the raw column (or the raw string when not JSON).
- `describe('POST /api/content/:slug')`
  - `wraps a plain value under the default locale` — `{ title: 'Scarpa', slug: 'scarpa' }` → `201`; raw column `'{"it":"Scarpa"}'` (the stored string — the storage contract).
  - `derives the entry slug from the default-locale value` — `{ title: { it: 'Scarpa Rossa', en: 'Red Shoe' } }` with no slug → `201`; row `slug` `'scarpa-rossa'`. **Regression guard comment**: `String(dictionary)` produced `object-object`.
- `describe('PUT /api/content/:slug/:id')`
  - `merges one translation and keeps the others` — stored `{ it: 'Scarpa' }`; PUT `{ title: { en: 'Shoe' } }` → `200`; raw `{ it: 'Scarpa', en: 'Shoe' }`.
  - `replaces only the default locale when a plain value is sent` — stored `{ it, en }`; PUT `{ title: 'Scarpetta' }` → raw `{ it: 'Scarpetta', en: 'Shoe' }`.
  - `clears one locale with a blank value` — PUT `{ title: { en: '' } }` → raw `{ it: 'Scarpa' }`.
  - `merges a legacy plain value written before the branch became localized` — ARRANGE: seed with non-localized `title`; POST `{ title: 'Scarpa' }`; toggle `localized: true` via `PUT /api/seeds/:slug` (Sprint 1 path). ACT: PUT content `{ title: { en: 'Shoe' } }`. ASSERT: raw `{ it: 'Scarpa', en: 'Shoe' }`.
  - `keeps a translation in a locale removed from settings` — stored `{ it, en }`; PUT settings `locales: ['it']`; ACT PUT content `{ title: 'Nuova' }` → raw `{ it: 'Nuova', en: 'Shoe' }`.
  - `accepts a single-language save on a requiredOnUpdate branch` — branch `requiredOnUpdate: true`; PUT `{ title: { en: 'Shoe' } }` → `200` (Violation 2 guard).
  - `rejects a per-locale type error at alias.locale and leaves the row unchanged` — PUT `{ title: { en: 42 } }` → `400`, `type` ends with `content-validation-failed`, `errors` contains `{ field: 'title.en' }` (`toMatchObject`); raw column unchanged.
- `describe('PATCH /api/content/:slug/bulk')` (`content.patch('/:slug/bulk', bulkHandler)`, `features/content/index.ts:L44`)
  - `refuses a localized field with 400 field-not-bulk-editable and writes nothing` — body `{ ids: [id], fields: { title: 'X' } }` → `400`, `type` ends with `field-not-bulk-editable`; raw column unchanged.
- Deliberate omission comment: the concurrency guard is proven in the unit tier (T6); a race between the handler's read and write cannot be staged through one HTTP request.

**T11 — `draft-localization.integration.test.ts`** (NEW; `describe('draft slice — localization (real D1)')`). Seed with `allowDrafts: true`, `title` localized.
- `describe('PUT /api/content/:slug/:id/draft')`
  - `drafts a single translation on top of the live dictionary` — live `{ it: 'Scarpa' }`; PUT draft `{ title: { en: 'Shoe' } }` → `200`; `SELECT title FROM content_<slug>_drafts WHERE entry_id = ?` (draft table name per `BaseD1Repository.getTableName(slug, true)`, `base.repository.d1.ts:L18`) parses to `{ it: 'Scarpa', en: 'Shoe' }`; live column still `{ it: 'Scarpa' }`.
  - `builds on the pending draft rather than live for an already drafted field` — two successive draft PUTs `{ en: 'Shoe' }` then `{ it: 'Scarpetta' }` (first in ARRANGE) → draft column `{ it: 'Scarpetta', en: 'Shoe' }`.
- `describe('POST /api/content/:slug/:id/draft/publish')`
  - `publishes a complete dictionary` — ARRANGE draft `{ en: 'Shoe' }` over live `{ it: 'Scarpa' }`; ACT publish → `200`; live raw `{ it: 'Scarpa', en: 'Shoe' }`.

**T12 — `public-localization-write.integration.test.ts`** (NEW; `describe('public slice — localized writes (real D1)')`).
Seed via `defineSeed` in the harness (`allowPublicPost: true`, `allowPublicEdit: true`, `title` text
`localized: true`, `policies: { public: true }`, `requiredOnCreate`) as `public-trash-isolation` does;
configure locales via admin `PUT /api/settings`; public calls carry `X-API-Key: TEST_PUBLIC_WRITE_KEY`
(bypasses Time-Trap, `public-add.ts:L232`).
- `POST /api/v1/public/:seed/add stores a plain value under the default locale and slugs from it` — `{ title: 'Scarpa' }` → `201`; raw `{ it: 'Scarpa' }`; row slug `'scarpa'`.
- `PUT /api/v1/public/:seed/edit/:id merges one translation and keeps the others` — entry created by admin with `{ it: 'Scarpa' }`; public PUT `{ title: { en: 'Shoe' } }` → `200`; raw `{ it: 'Scarpa', en: 'Shoe' }`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root.

1. Core build + unit tests:
   - `pnpm --filter @beechcms/core build`
   - `pnpm --filter @beechcms/core test`
2. API type-check: `npx tsc -p tsconfig.build.json --noEmit` in `apps/api/`
3. API unit tier: `pnpm --filter @beechcms/api test:unit`
4. API integration tier (workerd, real D1): `pnpm --filter @beechcms/api test:integration`
5. Dashboard type-check (`SiteSettings` is not consumed there; the check guards the additive kanban/core
   changes): `pnpm --filter @beechcms/dashboard type-check`. The 6 pre-existing errors in
   `src/features/content-transfer/**` and `src/test/setup.ts` are documented in Sprint 1's execution log.
   No new error is allowed.
6. Workspace: `pnpm beech test --diff` and `pnpm lint`
7. Graph: `graphify update . --force`

No `pnpm beech db:migrate` / `db:reset`: the sprint has no migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `localization.ts` adds exactly `LocaleSettings`, `resolveLocaleConfig`, `applyLocalizedPatch`,
      `localizedAliasesIn`, `mergeLocalizedFields`, `resolveLocalizedValue`, `resolveLocalizedFields`. It stays
      pure, with no I/O, and imports only `./types.js` (types) and `./validation/primitives.js`.
      `@beechcms/core` `package.json` dependencies are unchanged.
- [ ] `resolveLocaleConfig` always returns a config satisfying the `LocaleConfig` invariant (non-empty,
      valid, deduplicated, contains `defaultLocale`), defaulting to `[defaultLanguage]`.
- [ ] `GET /api/settings` returns resolved `locales` / `defaultLocale`. `PUT /api/settings` validates codes,
      rejects duplicates and lists outside 1–50 entries, enforces `defaultLocale ∈ locales`, persists both
      keys together, and writes nothing on refusal.
- [ ] Removing a locale from settings leaves every stored translation byte-identical (integration-proven).
- [ ] Every content write path that validates a payload passes `localeConfig` for seeds with a localized
      branch: content create / update, draft save, import worker, public add / edit.
- [ ] Update, draft save and public edit merge into the stored dictionary. Unmentioned locales, locales no
      longer registered, and legacy plain values (as default locale) all survive. Integration-proven.
- [ ] Draft publish yields a complete dictionary on live (integration-proven).
- [ ] An update or public edit that merges a localized branch without a client version sends the stored
      `updated_at` as `ifMatch` (unit-proven). Public edit maps `EntryConflictError` to `409`.
- [ ] `requiredOnUpdate` on a localized branch accepts a patch that leaves the default locale untouched and
      still refuses an explicit default-locale clear.
- [ ] Bulk edit refuses localized fields (`400 field-not-bulk-editable`), kanban excludes localized axes,
      and automation `edit_field` throws on a localized target. None of the three writes anything.
- [ ] Slugs, activity-log titles and notifications derived from a localized field use its default-locale
      string, never `object-object` / `[object Object]`.
- [ ] Seeds without a localized branch: no `site_settings` read on writes, validation options identical to
      today (unit-proven by T4), and every pre-existing test green.
- [ ] Zero changes under `apps/api/src/{factory.ts,types.ts,middleware}`, `apps/api/migrations`,
      `D1ContentRepository`, `packages/core/src/engine/{serialize,query,ddl,seed-ddl*,seed-validation,schema-fingerprint}.ts`,
      `kanban-move.ts`, `apps/dashboard`, `packages/{client,api-client,mcp,cli,testing}`.
- [ ] All SECTION 5 commands pass, and every new or changed test file conforms to `testing_conventions.md` (§8).

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify any of the following in this sprint:

- **Read-side negotiation**: `?lang` / `Accept-Language`, `?lang=all|*`, flat public projection, masked
  visibility per resolved value, edge-cache key + `Vary`, relation includes, `SelectOptions.locale` /
  `json_extract` filters and sort, `@beechcms/client` `.lang()`. It *consumes* this sprint's
  `resolveLocalizedValue` / `resolveLocalizedFields` and must not redefine them. → ROADMAP §3
  `LocalizedReadNegotiation`.
- **Public write response shape**: `public-add` / `public-edit` still echo the validated patch in `data`;
  flattening it to the negotiated language is part of the read contract. → ROADMAP §3.
- **Settings caching** for read paths (must be version-token based, never "invalidate on PUT"). → ROADMAP §3.
- **Any dashboard work**: languages settings UI, Seed Builder toggle, rendering dictionaries in tables /
  cards / display names / command palette / drafts list, hiding localized fields from bulk edit and the
  kanban axis picker, Entry Editor locale selector. → ROADMAP §4, §5. **Known interim risk (rollout
  invariant):** until Sprint 4, a technical user who localizes a field through the Seeds API and then opens
  the entry in the dashboard sees a dictionary where the editor expects a scalar. Do not patch the
  dashboard here.
- **Per-locale merge for bulk edit and automation `edit_field`**: refused in v1, as a known limit recorded in the ROADMAP.
- **Atomic SQL-level merge** (`json_set` / `json_patch` in the repository): VETOED. `json_patch` deep-merges
  per-locale richtext/json objects and breaks whole-value swap (brief §4). The version guard covers the race.
- **Any change** to `D1ContentRepository`, `serialize.ts`, FTS DDL/triggers, `query.ts`, seed validation,
  schema fingerprint, migrations, `factory.ts`, `types.ts`, middleware, `kanban-move.ts`,
  `rotate-field`, `create-entry.executor.ts`, `setup/index.ts`, docs.
- Permanently out of scope (brief §5): localized slugs, built-in machine translation, dashboard UI i18n,
  per-language RBAC, nested/partial json translation, orphan-locale purge tool, multi-currency.
