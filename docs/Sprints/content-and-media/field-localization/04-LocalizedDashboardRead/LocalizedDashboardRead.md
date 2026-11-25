# Sprint: LocalizedDashboardRead

Sprint 4 of 5 of **Field-Level Localization** (roadmap: `backlog/ROADMAP.md`). The roadmap called this slot
`LocalizationDashboardSchema`. It is renamed because the VETO audit (§5a) moves the Seed Builder toggle to Sprint 5.

Sprints 1–3 are archived in `docs/Sprints/` with review PASS. Every write path now stores locale dictionaries,
and the Public API returns them flat. The dashboard does not resolve them yet. Wherever it shows a localized
value, it prints the stored dictionary. A table cell shows `{"it":"Scarpa","en":"Shoe"}`. A relation chip shows
`[object Object]`. The drafts list, the command palette and the back-reference panel show the raw JSON text. A
sort or filter on a localized column in the content table compares that raw JSON text, so the order disagrees
with what the cell shows. There is also no screen to manage the project's languages. `locales` / `defaultLocale`
can be set only with `PUT /api/settings`.

This sprint makes the dashboard **read** localized content correctly, in the project's default language, and adds
Settings → Content languages. It adds no authoring UI: the "Localized" toggle and the Entry Editor language
selector both ship in Sprint 5.
A project with no localized branch behaves exactly as it does today. It makes no extra `GET /api/settings`
request, makes no extra D1 read, and its API responses are unchanged.

---

### Pre-Computation Analysis

The graph was refreshed first with `graphify update . --force` (21 609 nodes, 32 593 edges, 2 065 communities).
It includes the Sprint 1–3 working-tree code.

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `D1ContentRepository` | **53** | `apps/api/src/shared/db/repositories/content.repository.d1.ts:L119` | **Not touched.** `findMany` already forwards `SelectOptions.locale` to core `buildSelectQuery` (Sprint 3). `findPendingDrafts` keeps selecting the raw title column, and the drafts handler resolves it. |
| `useSchema()` | **47** | `apps/dashboard/src/features/shared/hooks/use-schema.ts:L10` | **Not touched.** Read by the new `useLocaleConfig()`, which fetches settings only when some seed has a localized branch. |
| `loadLocaleConfig()` | 14 | `apps/api/src/shared/localization/locale-config.ts:L14` | Reused unchanged by the list handler. A sibling loader, `loadDisplayLocaleConfig()`, is added next to it. |
| `useFieldsConfig()` | 12 | `apps/dashboard/src/components/fields/context.tsx:L123` | The DI context gains one slot, `useLocaleConfig`. Relation labels resolve through it. |
| `listHandler()` | 10 | `apps/api/src/features/content/handlers/list.ts:L92` | Passes `locale` to `findMany` (sort and filter in the default locale). `buildRelationsMap` resolves localized relation labels. |
| `deserializeFromDb()` | 9 | `packages/core/src/engine/serialize.ts:L145` | Consumed, not changed. It decodes a raw display-name column, and it is a no-op on text/richtext/json values that are already decoded. |
| `useGeneralSettings()` | 9 | `apps/dashboard/src/features/settings/hooks/use-settings.ts:L21` | Its query key moves to `features/shared` (`GENERAL_SETTINGS_QUERY_KEY`), so `useLocaleConfig` shares the cache entry and a settings save refreshes both. |
| `useContentList()` | 8 | `apps/dashboard/src/features/content-management/hooks/use-content-list.ts:L21` | Localizes list items through `select`. Table, gallery cards and gallery peek all read this data. |
| `BulkEditDialog()` | 7 | `apps/dashboard/src/features/bulk-edit/bulk-edit-dialog.tsx:L74` | `isBulkEditable` excludes localized branches. The API has refused them since Sprint 2. |
| `fullTextSearchHandler()` | 6 | `apps/api/src/features/search/handlers/full-text-search.ts:L39` | Resolves result titles (command palette). |
| `backrefsApp` | 6 | `apps/api/src/features/backrefs/backrefs.handler.ts:L16` | Resolves `displayName` before masking. |
| `resolveLocalizedValue()` / `resolveLocalizedFields()` | 5 / 8 | `packages/core/src/engine/localization.ts:L222 / L241` | Consumed, not redefined (roadmap rule). |
| `useKanbanColumnQuery()` | 4 | `apps/dashboard/src/features/content-kanban/hooks/use-kanban-column-query.ts:L9` | Localizes each item before building its card model. |
| `FieldsContextType` | 4 | `apps/dashboard/src/components/fields/context.tsx:L26` | + `useLocaleConfig`. Three test mocks must add it (see (c)). |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` | **No** | Zero files. Every resolver this sprint needs already exists: `resolveLocaleConfig`, `resolveLocalizedValue`, `resolveLocalizedFields`, `isLocalizedBranch`, `isLocaleCode`, `deserializeFromDb`, `SelectLocale`. |
| `apps/api/shared/localization` | **Yes** | New `display-name.ts` (`loadDisplayLocaleConfig`, `resolveDisplayName`). `locale-config.ts` unchanged. |
| `apps/api/features/content` | **Yes** | `handlers/list.ts` only. |
| `apps/api/features/draft` | **Yes** | `draft.handler.ts`: `GET /drafts` only. |
| `apps/api/features/search` | **Yes** | `handlers/full-text-search.ts` only. |
| `apps/api/features/backrefs` | **Yes** | `backrefs.handler.ts` only. |
| `apps/api` — `factory.ts`, `types.ts`, `middleware/`, repositories, migrations, `public/`, `features/settings`, `features/seeds`, `features/widget` | **No** | Zero files. `GET/PUT /api/settings` already expose and validate `locales` / `defaultLocale` (Sprint 2). |
| `apps/dashboard/features/shared` | **Yes** | `query-keys.ts`, new `hooks/use-locale-config.ts`, `index.ts`. |
| `apps/dashboard/features/settings` | **Yes** | `types/settings.types.ts`, `hooks/use-settings.ts` (key), new `lib/content-languages.ts`, new `hooks/use-content-languages.ts`, new `components/content-languages-card.tsx`, `components/general-tab.tsx`. |
| `apps/dashboard/features/content-management` | **Yes** | `hooks/use-content-list.ts`, `components/ContentTrashView.tsx`. |
| `apps/dashboard/features/content-kanban` | **Yes** | `hooks/use-kanban-column-query.ts`. |
| `apps/dashboard/features/bulk-edit` | **Yes** | `bulk-edit-dialog.tsx` (`isBulkEditable`). |
| `apps/dashboard/components/fields` | **Yes** | `context.tsx` (slot), new `relation-label.ts`, `display/relation.tsx`, `edit/relation/relation-single.tsx`, `edit/relation/relation-multi.tsx`. |
| `apps/dashboard` — `App.tsx`, `locales/{en,it}.json` | **Yes** | Wire the DI slot. Add i18n keys. |
| `apps/dashboard` — `seed-builder`, `entry-editor`, `drafts`, `command-palette`, `content-gallery`, `dashboard` | **No** | Gallery and peek read `useContentList` data. Drafts, command palette and back-refs receive resolved titles from the API. The Seed Builder and Entry Editor are Sprint 5. |
| `@beechcms/client`, `api-client`, `mcp`, `cli`, `testing` | **No** | Zero files. |

Middleware registration order for the authenticated routes this sprint touches (read from `factory.ts`, **unchanged**):
1. `repositoryMiddleware` (L129) injects `repository`, `siteSettingsRepository`, …
2. `seedRegistryMiddleware` (L143) injects `seedRegistry`, `getSeed`, `backrefMap`.
3. `storageMiddleware`, `queueMiddleware`, `authProvidersMiddleware`, `rateLimiterMiddleware`, `observabilityMiddleware` (L146–154).
4. CORS (L156), security headers (L197), analytics on `/api/*` (L208).
5. `apiProtected`: `authMiddleware` (L239) → `oauthScopeMiddleware` (L242) → `permissionMiddleware` (L246). Routes:
   `/settings` (L248), `/schema` (L249), then on `/content` `draftApp` (L256) → `backrefsApp` (L257) → `contentFeature` (L258),
   and `/search` (L261).
6. Permission rules (`middleware/permission.middleware.ts`): `GET /api/settings` → `AUTHED` (L82), so every dashboard user can read
   `locales` / `defaultLocale`. `PUT /api/settings` → `manage_users` global (L83). That matches the General tab's visibility rule
   (`settings-dialog.tsx:L127`, `canGlobally('manage_users')`).

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "listHandler()" --depth 2
- list.test.ts, features/content/index.ts, factory.ts
$ graphify affected "buildRelationsMap()" --depth 2
- listHandler() list.ts:L92, list.test.ts, features/content/index.ts
$ graphify affected "fullTextSearchHandler()" --depth 2
- full-text-search.test.ts, search.ts, features/search/index.ts
$ graphify affected "filterVisibility()" --depth 2        (backrefs)
- No affected nodes found.
$ graphify affected "loadLocaleConfig()" --depth 2
- create.ts, update.ts, import-chunk.worker.ts, draft.handler.ts, public-add.ts, public-edit.ts (+ their tests)
  → consumed read-only here; its signature does not change.
$ graphify affected "useContentList()" --depth 2
- use-content-list-query.ts / useContentListQuery(), content-list.tsx / ContentListPage(),
  content-list-relation.test.tsx, features/content-management/index.ts, use-content-table-config.ts, App.tsx
$ graphify affected "useKanbanColumnQuery()" --depth 2
- content-kanban.tsx / KanbanColumnConnected(), features/content-kanban/index.ts
$ graphify affected "FieldsContextType" --depth 2
- content-list-relation.test.tsx, relation.test.tsx, edit-richtext.test.tsx
$ graphify affected "RelationDisplay()" --depth 2
- registry.ts, FieldDisplay.tsx, FieldEdit.tsx, repeater-generic-item.tsx, field-registry.test.ts,
  content-list-relation.test.tsx, relation.test.tsx, components/fields/index.ts
$ graphify affected "isBulkEditable()" --depth 2
- No affected nodes found.
$ graphify affected "GeneralTab()" --depth 2
- settings-dialog.tsx, settings-page.tsx, settings-dialog.test.tsx (mocks GeneralTab wholesale), settings/index.ts
$ graphify affected "GeneralSettings" --depth 2
- settings.api.ts, settings.api.test.ts, use-settings.ts
```

**Breaking-change verdict: none for a project with no localized branch, and none for any non-localized value.**
- **API.** Every change is gated by `isLocalizedBranch`. `loadLocaleConfig` / `loadDisplayLocaleConfig` return `undefined`
  **without touching the repository** when no relevant branch is localized. The handlers then run today's code: `locale: undefined`
  reaches `buildSelectQuery`, which emits byte-identical SQL (Sprint 3 T2c), and `resolveDisplayName(…, undefined)` returns its input.
  Existing unit tests that build a fake context with no `siteSettingsRepository` keep passing, because the repository argument is never
  dereferenced on that path.
- **`GET /api/content/:slug`** on a seed with a localized branch: sort and filter compare the default-locale value instead of the raw
  JSON text. `relations` labels of localized targets become the default-locale string instead of `"[object Object]"`. Item `data` is
  **unchanged**: still the raw dictionaries, which Sprint 5's editor and every API consumer rely on.
- **`GET /api/content/drafts`, `GET /api/search`, `GET /api/content/:slug/:id/backrefs`:** a title / `displayName` from a localized
  display-name branch becomes the default-locale string instead of the raw JSON text. These endpoints serve only the dashboard, and
  the old value was never renderable.
- **Dashboard.** `useLocaleConfig()` is `enabled` only when `useSchema()` contains a localized branch, so a mono-lingual project makes
  no new request. `useLocalizeEntryData()` is then the identity, and `useContentList`'s `select` returns the response object itself.
- **`FieldsContextType`** gains a required slot. The three test files that construct it (listed above) add `useLocaleConfig: () => undefined`.
  That completes the fixture and changes no assertion (§7.10 is respected).
- **`content-list-relation.test.tsx`** mocks `@/features/shared` as `{ useSchema, useActiveSeed }`. `useContentList` now also calls
  `useLocalizeEntryData`, so the mock adds `useLocalizeEntryData: () => (_seed, data) => data`. That is the same kind of fixture
  completion, and no assertion changes.

**VSA boundary proof:**
```
$ graphify path "useContentList()" "useSchema()"
  useContentList() --calls--> useSchema()                       (content-management → features/shared: allowed)
$ graphify path "RelationDisplay()" "useSchema()"
  RelationDisplay() --calls--> useSchema()                      (resolved through the FieldsContext DI slot, not an import)
$ graphify path "fullTextSearchHandler()" "loadLocaleConfig()"
  fullTextSearchHandler() --calls--> filterSeedsByPermission() <--imports-- draft.handler.ts --imports--> loadLocaleConfig()
  (no search → draft edge: the only link is two slices importing the same shared/ module)
$ graphify path "ActionSelector()" "useGeneralSettings()"
  ActionSelector() --calls--> useGeneralSettings()              (PRE-EXISTING automations → settings import; see VETO §2)
```
Every new import in this sprint points from a slice to `features/shared`, `components/fields` (DI), `shared/localization`
(API) or `@beechcms/core`. No slice imports another slice.

---

### VETO Audit

**1. THE BOTANICAL INVARIANT — no D1 query bypasses `@beechcms/core`.**
- ✅ No new SQL. Sort and filter in a language reuse core `buildSelectQuery` via `SelectOptions.locale`, which reaches D1 only through
  `D1ContentRepository.findMany`.
- ✅ Display-name columns that hand-written SELECTs already return (drafts, search, back-refs) are resolved **in JS after the read**. They
  are decoded with core `deserializeFromDb` and resolved with core `resolveLocalizedValue`. The fallback chain is not reimplemented, and no
  repository signature changes.
- ✅ No hardcoded field names. Every rule keys on `isLocalizedBranch(branch)` and on `seed.displayNameAlias` from the seed definition.
- ✅ The only new D1 access is the existing `site_settings` read (`siteSettingsRepository.getAll()`). It happens only when a relevant
  branch is localized, and at most once per endpoint per request.

**2. VSA ENFORCEMENT — zero cross-feature imports.**
- ✅ API: four slices (content, draft, search, back-refs) need the same "resolve a display name" step, so it goes to
  `apps/api/src/shared/localization/display-name.ts`, next to `loadLocaleConfig`. It does not go into any one slice.
- ✅ Dashboard: several slices plus `components/fields` need the project locale config, so it goes to `features/shared`
  (`useLocaleConfig`, `useLocalizeEntryData`, `GENERAL_SETTINGS_QUERY_KEY`). The settings slice keeps its own fetcher and invalidation.
  It reads the key from `features/shared`, as it already does for `ME_QUERY_KEY` (`use-settings.ts:L13`).
- ✅ `components/fields` stays module-agnostic: it gets the config through a new `FieldsContextType.useLocaleConfig` slot, which `App.tsx` wires
  to `useLocaleConfig`. It does not import `features/shared`.
- ⚠️ Pre-existing violation, **not fixed and not extended**: `features/automations/.../action-selector.tsx` imports `@/features/settings`
  (graph path above). Moving `useGeneralSettings` to shared is outside this feature, so it is filed as a ROADMAP fast-follow.

**3. CLOUDFLARE PURITY.** ✅ No migration, table, index, KV, queue or background job. No new dependency. Language names come from
the built-in `Intl.DisplayNames`.

**4. YAGNI — rejected alternatives.**
- ❌ **VETOED: resolving list items server-side on `GET /api/content/:slug`.** The endpoint also serves backoffice API clients. Its item
  `data` must stay the stored dictionaries, and Sprint 5's editor needs every translation. The API resolves only what it owns: SQL
  comparisons and titles it computes itself.
- ❌ **VETOED: resolving in `fieldsConfig.fetchById`.** It shares `CONTENT_QUERY_KEYS.detail` with the Entry Editor's `useContentEntry`, so a
  resolved object would poison the editor's cache entry. Relation labels resolve at render.
- ❌ **VETOED: an editor-locale query parameter on the authenticated list.** Lists show one language, the default, until a real need
  appears. Sprint 5's selector scopes to the editor.
- ❌ **VETOED: a new core function for "display name".** `deserializeFromDb` + `resolveLocalizedValue` already compose into it. The helper
  is 10 lines in `apps/api/shared`, and it has no dashboard twin because the dashboard never holds raw column text.
- ❌ **VETOED: localizing the widget data API (`/api/widget/*`).** Its repository returns storage-level rows by design (`d1-widget.repository.ts`:
  `list` does not even decode json, and `leaderboard` / `list` search compare the raw display column). Localizing it is its own decision, so it is
  filed as a ROADMAP fast-follow and not folded in here.
- ❌ **VETOED: vector-index titles (`d1-vector.repository.ts:getAllVectors`).** That is a search-index payload, not a dashboard surface. Filed as a fast-follow.
- ❌ **VETOED: relabelling the existing "Default Language" (`defaultLanguage`) field.** It is copy churn outside the feature. The new card
  explains itself.

**5. Carried-in decisions (ROADMAP §4).**
- **(a) Seed Builder toggle → moved to Sprint 5.** The Entry Editor cannot edit a dictionary yet: a text input receives an object, and
  BlockNote receives `{it: doc}`. If the toggle shipped now, a non-technical owner could enable localization and immediately get a broken
  editor. That is exactly the half-shipped state the roadmap's rollout invariant forbids. The toggle and the editor must ship together, so
  the toggle joins Sprint 5. The invariant is restated: until Sprint 5 ships, `localized` is set only through the Seeds API / manifest / MCP.
  Scope moved in `ROADMAP.md`.
- **(b) Authenticated list filters / sort (carried in from Sprint 3):** done here. The list handler passes
  `SelectOptions.locale = { code: defaultLocale, config }` when the seed has a localized branch. This is required, not optional. Without it,
  the content table would show resolved values while sorting and filtering by raw JSON, and a cell-click filter ("filter by this value")
  would send a resolved string that never matches.
- **(c) Reuse core `asLocaleDictionary` / `resolveLocalizedValue`:** honoured. The dashboard calls core `resolveLocalizedFields` /
  `resolveLocalizedValue` and never parses a dictionary itself.
- **(d) Which language the dashboard shows:** the project default locale everywhere, through core's chain (default → first stored
  translation → legacy value). One language across the whole dashboard, with no per-user preference (VETOED above).

**6. Removing a language (brief §2, no data loss).** The card calls it out explicitly. `PUT /api/settings` only rewrites the setting,
and translations stay in their dictionaries (`settings.handler.ts:L138-140`). The card refuses to remove the default language. The API
would answer `settings-default-locale-not-in-locales`. The card shows a hint that removed languages keep their translations.

VETO verdict: **approved**. HANDOFF -> caveman_coder.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 5 gives editors the authoring UI: the "Localized" toggle, the locale selector, fallback indicators and completion. It is only
safe once the rest of the dashboard already reads dictionaries correctly. Otherwise, the moment an owner translates a field, the
content table, cards, relation chips, the drafts list and the command palette start printing JSON. Language management must exist
before editors can pick a language. This sprint delivers both prerequisites, and a user can see neither until a field is localized:
- **Settings → Content languages** (`locales`, `defaultLocale`) through the already-shipped `PUT /api/settings`.
- **Read-side resolution** on every dashboard surface that renders a stored value, plus the API endpoints that compute a title or
  compare values for the dashboard.

Botanical Engine: zero core changes. Every resolution goes through core `resolveLocalizedValue` / `resolveLocalizedFields` and every
SQL comparison through core `buildSelectQuery`. VSA: shared logic lives in `apps/api/src/shared/localization` and
`apps/dashboard/src/features/shared`, and `components/fields` receives its dependency by injection. No slice imports another.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Core (unchanged, consumed).** `packages/core/src/engine/localization.ts` exports `LocaleConfig`, `LocaleSettings`, `isLocaleCode`,
`isLocalizedBranch`, `resolveLocaleConfig(settings)`, `resolveLocalizedValue(branch, value, locale, config)` (requested → default → first
stored translation → `null`; a legacy value is returned as-is) and `resolveLocalizedFields(seed, data, config, locale?)` (returns
`data` itself when `config` is `undefined`). `serialize.ts:L145 deserializeFromDb(branch, value)` decodes a localized text
dictionary from its TEXT column, returns a legacy plain string unchanged, and returns an already-decoded value unchanged
(`default: return value`; json/richtext parse only strings). `types.ts:L327 SelectLocale { code, config }` and `SelectOptions.locale`
are honoured by `buildSelectQuery` for WHERE and ORDER BY.

**API.**
- `GET /api/settings` (`settings.handler.ts:L28`) returns `locales` / `defaultLocale` already resolved through `resolveLocaleConfig`,
  plus `defaultLanguage`. `PUT` (`L59`) validates `locales` (1–50 distinct `isLocaleCode`), `defaultLocale ∈ locales`, and persists
  both keys together. The problem types are `settings-invalid-locales`, `settings-invalid-default-locale` and
  `settings-default-locale-not-in-locales`, each with a human `detail`.
- `shared/localization/locale-config.ts:L14 loadLocaleConfig(repository, seed)`: returns `undefined` without reading when `seed` has
  no localized branch.
- `features/content/handlers/list.ts`: `listHandler` calls `repository.findMany(seed, { filters, orderBy, search, pagination, kanbanOrder })`
  with no `locale`. `buildRelationsMap` (L21) reads `row[labelAlias]` from `findMany` (already decoded, so a localized label is an
  object) and emits `String(label)`, which is `"[object Object]"`.
- `features/draft/draft.handler.ts:L31 GET /drafts` returns `repository.findPendingDrafts(seeds)` as-is. Its `title` is the raw
  display-name column (`content.repository.d1.ts:L1766`, `COALESCE(d.<alias>, l.<alias>, …)`), i.e. the JSON text of a dictionary.
- `features/search/handlers/full-text-search.ts:L90` maps `SearchResultRow.title`. That is the raw column (`d1-search.query.ts:L134`,
  `ce.<displayNameAlias> AS title`).
- `features/backrefs/backrefs.handler.ts:L98 / L121` receives `BackrefItem.displayName`, the raw column
  (`d1-backref.repository.ts:L38`). `filterVisibility` (L149) then masks or hides it.

**Dashboard.**
- `features/shared/query-keys.ts` owns cross-slice keys. `features/settings/hooks/use-settings.ts:L10-19 SETTINGS_QUERY_KEYS.general()`
  = `['settings','general']`. `useUpdateGeneralSettings` invalidates it on success.
- `features/settings/types/settings.types.ts:L50 GeneralSettings` has no `locales` / `defaultLocale`.
  `components/general-tab.tsx` renders one card ("Site Defaults" + "Company Info") and one form, and its save sends an explicit
  payload that never includes locale keys (`use-general-tab.ts:L45-55`).
- `features/content-management/hooks/use-content-list.ts:L21`: TanStack `useQuery` over `contentApi.fetchList`, which feeds
  `useContentListQuery` → `pages/content-list.tsx` → table (`lib/dynamic-columns.tsx`) and gallery (`content-gallery.tsx`, which takes
  `data` as a prop, and whose `peekEntry` comes from that same data).
- `features/content-kanban/hooks/use-kanban-column-query.ts:L9`: `useInfiniteQuery` over `fetchKanbanColumn`, then
  `buildKanbanCardDisplayModel(item, …)`.
- `features/content-management/components/ContentTrashView.tsx:L66`: `String(row.data[seed.displayNameAlias ?? "title"] ?? row.id)`.
- `components/fields/context.tsx:L26 FieldsContextType` has the slots `useSchema`, `fetchById`, `searchRelations`, `queryKeys`,
  `components`, all wired in `App.tsx:L39-49`. Relation labels read `entry.data[labelAlias]` at six sites:
  `display/relation.tsx:L63, L131`, `edit/relation/relation-single.tsx:L101, L119`, `edit/relation/relation-multi.tsx:L70, L194`.
- `features/bulk-edit/bulk-edit-dialog.tsx:L60 isBulkEditable` excludes hidden and non-plain branches, but not localized ones.
- `features/seed-builder` round-trips `localized` untouched: `seedToFormData` passes `branches` through, and `BranchItemRow` spreads the
  branch on every change. A seed localized through the API stays localized when it is edited in the builder. No change is needed this
  sprint.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Production files (**zero** under `packages/`):

| # | File | Change |
|---|------|--------|
| 1 | `apps/api/src/shared/localization/display-name.ts` | **New.** `loadDisplayLocaleConfig`, `resolveDisplayName`. |
| 2 | `apps/api/src/features/content/handlers/list.ts` | `locale` for `findMany`. `buildRelationsMap` resolves labels. |
| 3 | `apps/api/src/features/draft/draft.handler.ts` | `GET /drafts` resolves `title`. |
| 4 | `apps/api/src/features/search/handlers/full-text-search.ts` | Resolves result `title`. |
| 5 | `apps/api/src/features/backrefs/backrefs.handler.ts` | Resolves `displayName` before `filterVisibility`. |
| 6 | `apps/dashboard/src/features/shared/query-keys.ts` | + `GENERAL_SETTINGS_QUERY_KEY`. |
| 7 | `apps/dashboard/src/features/shared/hooks/use-locale-config.ts` | **New.** `useLocaleConfig`, `useLocalizeEntryData`, `LocalizeEntryData`. |
| 8 | `apps/dashboard/src/features/shared/index.ts` | Re-export (7). |
| 9 | `apps/dashboard/src/features/settings/hooks/use-settings.ts` | `general: () => GENERAL_SETTINGS_QUERY_KEY`. |
| 10 | `apps/dashboard/src/features/settings/types/settings.types.ts` | `GeneralSettings.locales`, `.defaultLocale`. |
| 11 | `apps/dashboard/src/features/settings/lib/content-languages.ts` | **New.** Pure list operations. |
| 12 | `apps/dashboard/src/features/settings/hooks/use-content-languages.ts` | **New.** Card state and save. |
| 13 | `apps/dashboard/src/features/settings/components/content-languages-card.tsx` | **New.** |
| 14 | `apps/dashboard/src/features/settings/components/general-tab.tsx` | Renders (13) below the existing card. |
| 15 | `apps/dashboard/src/features/content-management/hooks/use-content-list.ts` | `select` localizes items. |
| 16 | `apps/dashboard/src/features/content-management/components/ContentTrashView.tsx` | Display column through `useLocalizeEntryData`. |
| 17 | `apps/dashboard/src/features/content-kanban/hooks/use-kanban-column-query.ts` | Localizes items before the card model. |
| 18 | `apps/dashboard/src/features/bulk-edit/bulk-edit-dialog.tsx` | `isBulkEditable` excludes localized branches. |
| 19 | `apps/dashboard/src/components/fields/context.tsx` | + `useLocaleConfig` slot. |
| 20 | `apps/dashboard/src/components/fields/relation-label.ts` | **New.** `relationLabelValue`, `useRelationLabel`. |
| 21 | `apps/dashboard/src/components/fields/display/relation.tsx` | Two label sites. |
| 22 | `apps/dashboard/src/components/fields/edit/relation/relation-single.tsx` | Two label sites. |
| 23 | `apps/dashboard/src/components/fields/edit/relation/relation-multi.tsx` | Two label sites. |
| 24 | `apps/dashboard/src/App.tsx` | `fieldsConfig.useLocaleConfig = useLocaleConfig`. |
| 25 | `apps/dashboard/src/locales/en.json`, `it.json` | `settings.contentLanguages.*`. |

Test files:

| # | File | Tier |
|---|------|------|
| T1 | `apps/api/src/shared/localization/display-name.test.ts` | unit (new) |
| T2 | `apps/api/src/features/content/test/integration/content-localized-list.integration.test.ts` | integration (new) |
| T3 | `apps/api/src/features/draft/test/integration/draft-localization.integration.test.ts` | integration (add one `describe`) |
| T4 | `apps/api/src/features/search/test/integration/search-localization.integration.test.ts` | integration (new) |
| T5 | `apps/api/src/features/backrefs/test/integration/backrefs-localization.integration.test.ts` | integration (new) |
| T6 | `apps/dashboard/src/features/settings/lib/content-languages.test.ts` | unit (new) |
| T7 | `apps/dashboard/src/features/shared/hooks/use-locale-config.test.tsx` | unit (new) |
| T8 | `apps/dashboard/src/components/fields/relation-label.test.ts` | unit (new) |
| T9 | `apps/dashboard/src/test/cross-slice/content-list-localization.test.tsx` | dashboard cross-slice (new) |
| T10 | `apps/dashboard/src/test/cross-slice/bulk-edit-dialog.test.tsx` | add one `it` |
| T11 | `test/cross-slice/content-list-relation.test.tsx`, `test/cross-slice/relation.test.tsx`, `features/richtext-editor/test/unit/edit-richtext.test.tsx` | Fixture completion only (see Pre-Computation (c)). |

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

No D1 migration and no DDL in this sprint. Quote style: single quotes in `apps/api`, double quotes in `apps/dashboard` (match each
file). Every new file opens with the repo SPDX header (BUSL-1.1, as in its neighbours).

--------------------------------------------------------------------------
Task 1 — `apps/api/src/shared/localization/display-name.ts` (new)
--------------------------------------------------------------------------

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { deserializeFromDb, isLocalizedBranch, resolveLocaleConfig, resolveLocalizedValue } from '@beechcms/core'
import type { Branch, ISiteSettingsRepository, LocaleConfig, Seed } from '@beechcms/core'

type DisplaySeed = Pick<Seed, 'branches' | 'displayNameAlias'>

function localizedDisplayBranch(seed: DisplaySeed): Branch | undefined {
  const branch = seed.branches.find((b) => b.alias === seed.displayNameAlias)
  return branch && isLocalizedBranch(branch) ? branch : undefined
}

/**
 * Loads the project's LocaleConfig for endpoints that show display names of `seeds`, or `undefined` —
 * without reading — when none of them has a localized display-name branch. Uncached for the same reason as
 * `loadLocaleConfig`: an isolate cache invalidated on settings PUT stays stale in every other isolate.
 */
export async function loadDisplayLocaleConfig(
  repository: Pick<ISiteSettingsRepository, 'getAll'>,
  seeds: readonly DisplaySeed[],
): Promise<LocaleConfig | undefined> {
  if (!seeds.some((seed) => localizedDisplayBranch(seed) !== undefined)) return undefined
  return resolveLocaleConfig(await repository.getAll())
}

/**
 * The display name of an entry of `seed`, resolved to the default locale. `value` is the display-name column
 * either as raw storage text (hand-written SELECTs) or already decoded (repository reads): `deserializeFromDb`
 * is a no-op on decoded text / richtext / json values, so one helper serves both.
 * Returns `value` unchanged when `config` is undefined, the display-name branch is not localized, or the resolved
 * translation is not a string (a localized json/richtext display name keeps today's behaviour).
 */
export function resolveDisplayName<T>(seed: DisplaySeed, value: T, config: LocaleConfig | undefined): T | string {
  if (!config) return value
  const branch = localizedDisplayBranch(seed)
  if (!branch) return value
  const resolved = resolveLocalizedValue(branch, deserializeFromDb(branch, value), config.defaultLocale, config)
  return typeof resolved === 'string' ? resolved : value
}
```

Check that `ISiteSettingsRepository` and `Branch` are exported from `@beechcms/core`. `locale-config.ts` already imports
`ISiteSettingsRepository` from it. Do **not** modify `locale-config.ts`.

--------------------------------------------------------------------------
Task 2 — `features/content/handlers/list.ts`
--------------------------------------------------------------------------

Imports (add):
```ts
import { resolveKanbanConfig, type FilterGroup, type ActorContext, type LocaleConfig, type Seed } from '@beechcms/core'
import { loadLocaleConfig } from '../../../shared/localization/locale-config'
import { loadDisplayLocaleConfig, resolveDisplayName } from '../../../shared/localization/display-name'
```

2a. In `listHandler`, immediately before `const repository = context.get('repository')` (currently L173):
```ts
    // Sort and filter compare the value the dashboard shows (default locale), not the stored JSON text.
    const localeConfig = await loadLocaleConfig(context.get('siteSettingsRepository'), seed)
```
and add one key to the `findMany` options object:
```ts
      locale: localeConfig ? { code: localeConfig.defaultLocale, config: localeConfig } : undefined,
```
The response `items[].data` is **not** resolved (VETO §4).

2b. `buildRelationsMap` gains a parameter and resolves labels:
```ts
async function buildRelationsMap(
  context: Context<AppEnv>,
  seed: Parameters<typeof applyVisibility>[1],
  entries: Record<string, unknown>[],
  localeConfig: LocaleConfig | undefined,
): Promise<Record<string, Record<string, string>>> {
```
After `const seedRegistry = context.get('seedRegistry')` and before the loop:
```ts
  const targetSeeds = relationBranches
    .map((branch) => (branch.targetSeed ? seedRegistry.get(branch.targetSeed) : undefined))
    .filter((target): target is Seed => target !== undefined)
  // Reuse the list's config when it was loaded; otherwise read settings only if a target's label is localized.
  const labelConfig = localeConfig ?? await loadDisplayLocaleConfig(context.get('siteSettingsRepository'), targetSeeds)
```
Inside the item loop, replace `const label = row[labelAlias]` with:
```ts
        const label = resolveDisplayName(targetSeedDef, row[labelAlias], labelConfig)
```
Keep the existing `label != null && label !== '' ? String(label) : id` line unchanged. Update the call site:
`const relations = await buildRelationsMap(context, seed, entries, localeConfig)`.

If `seedRegistry.get` is typed as returning something other than `Seed | undefined`, adapt the type guard to its declared return
type. Do not cast.

--------------------------------------------------------------------------
Task 3 — `features/draft/draft.handler.ts` (`GET /drafts` only)
--------------------------------------------------------------------------

Import `{ loadDisplayLocaleConfig, resolveDisplayName }` from `'../../shared/localization/display-name'`. Replace the last two
lines of the `GET /drafts` handler:
```ts
  const repository = context.get('repository')
  const drafts = await repository.findPendingDrafts(seeds)
  const localeConfig = await loadDisplayLocaleConfig(context.get('siteSettingsRepository'), seeds)
  if (!localeConfig) return context.json(drafts)
  const seedsBySlug = new Map(seeds.map((seed) => [seed.slug, seed]))
  return context.json(drafts.map((draft) => {
    const seed = seedsBySlug.get(draft.seedSlug)
    return seed ? { ...draft, title: resolveDisplayName(seed, draft.title, localeConfig) } : draft
  }))
```
The rest of the file is unchanged.

--------------------------------------------------------------------------
Task 4 — `features/search/handlers/full-text-search.ts`
--------------------------------------------------------------------------

Import `{ loadDisplayLocaleConfig, resolveDisplayName }` from `'../../../shared/localization/display-name'`. Replace
`const items = pageRows.map(mapSearchResultRow)` with:
```ts
  const localeConfig = await loadDisplayLocaleConfig(c.get('siteSettingsRepository'), searchableSeeds)
  const seedsBySlug = new Map(searchableSeeds.map((seed) => [seed.slug, seed]))
  const items = pageRows.map((row) => {
    const seed = seedsBySlug.get(row.schemaSlug)
    return mapSearchResultRow(seed ? { ...row, title: resolveDisplayName(seed, row.title, localeConfig) } : row)
  })
```
The call stays after the `pageRows.length === 0` early return, so an empty page never reads settings. FTS matching is unchanged,
because triggers index every language (Sprint 3).

--------------------------------------------------------------------------
Task 5 — `features/backrefs/backrefs.handler.ts`
--------------------------------------------------------------------------

Imports: `import type { LocaleConfig, Seed } from '@beechcms/core'` (merge with the existing `resolvePolicies` import) and
`{ loadDisplayLocaleConfig, resolveDisplayName }` from `'../../shared/localization/display-name'`.

After step 3 (`sources` non-empty, before step 4):
```ts
  const sourceSeeds = sources
    .map((source) => getSeed(source.sourceSlug))
    .filter((seed): seed is Seed => seed !== undefined)
  const localeConfig = await loadDisplayLocaleConfig(c.get('siteSettingsRepository'), sourceSeeds)
```
Add a helper next to `filterVisibility`:
```ts
/** Resolves localized display names to the default locale; masking then applies to the resolved string. */
function localizeDisplayNames(items: BackrefItem[], sourceSeed: Seed, localeConfig: LocaleConfig | undefined): BackrefItem[] {
  if (!localeConfig) return items
  return items.map((item) => ({ ...item, displayName: resolveDisplayName(sourceSeed, item.displayName, localeConfig) }))
}
```
At both call sites (L99 and L122), replace `filterVisibility(items, sourceSeed)` with
`filterVisibility(localizeDisplayNames(items, sourceSeed, localeConfig), sourceSeed)`. `filterVisibility` itself is unchanged. If
`getSeed`'s declared return type is not `Seed | undefined`, adapt the guard. Do not cast.

--------------------------------------------------------------------------
Task 6 — `features/shared/query-keys.ts`
--------------------------------------------------------------------------

Append:
```ts
/**
 * `GET /api/settings`. The settings slice owns the fetcher and invalidates the key on save;
 * `useLocaleConfig` observes the same entry so a language change reaches every surface.
 */
export const GENERAL_SETTINGS_QUERY_KEY = ["settings", "general"] as const
```

--------------------------------------------------------------------------
Task 7 — `features/shared/hooks/use-locale-config.ts` (new) + barrel
--------------------------------------------------------------------------

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

import { useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  isLocalizedBranch,
  resolveLocaleConfig,
  resolveLocalizedFields,
  type LocaleConfig,
  type LocaleSettings,
  type Seed,
} from "@beechcms/core"
import { api } from "@/lib/api"
import { GENERAL_SETTINGS_QUERY_KEY } from "../query-keys"
import { useSchema } from "./use-schema"

/** Same staleness as the settings slice's `useGeneralSettings`, which shares this cache entry. */
const SETTINGS_STALE_MS = 24 * 60 * 60 * 1000

/**
 * The project's content-language config, or `undefined` while no seed has a localized branch — in which
 * case no settings request is made and every resolver below is the identity (mirrors the API).
 */
export function useLocaleConfig(): LocaleConfig | undefined {
  const { data: seeds } = useSchema()
  const hasLocalizedBranch = seeds?.some((seed) => seed.branches.some(isLocalizedBranch)) ?? false
  const { data } = useQuery({
    queryKey: GENERAL_SETTINGS_QUERY_KEY,
    // Same request and payload as the settings slice's fetcher: either observer may fill this entry.
    queryFn: async () => (await api.get<LocaleSettings>("/settings")).data,
    enabled: hasLocalizedBranch,
    staleTime: SETTINGS_STALE_MS,
    select: resolveLocaleConfig,
  })
  return hasLocalizedBranch ? data : undefined
}

/** Resolves an entry's localized branches to the default locale; returns `data` itself when nothing is localized. */
export type LocalizeEntryData = (
  seed: Pick<Seed, "branches"> | null | undefined,
  data: Record<string, unknown>,
) => Record<string, unknown>

/**
 * Dashboard read surfaces show one language: the project default (core fallback chain). The Entry Editor
 * does NOT use this — it needs the stored dictionaries.
 */
export function useLocalizeEntryData(): LocalizeEntryData {
  const config = useLocaleConfig()
  return useCallback(
    (seed, data) => (seed ? resolveLocalizedFields(seed, data, config) : data),
    [config],
  )
}
```
`select: resolveLocaleConfig` must be a stable reference (module-level import), because TanStack memoizes `select` by reference. The
settings payload satisfies `LocaleSettings` (`locales`, `defaultLocale`, `defaultLanguage`).

`features/shared/index.ts`: add `export * from "./hooks/use-locale-config"`. If `test/cross-slice/barrels.test.ts` enumerates the
barrel's exports, extend its expected list with `useLocaleConfig` and `useLocalizeEntryData`.

--------------------------------------------------------------------------
Task 8 — settings slice: key, types
--------------------------------------------------------------------------

`hooks/use-settings.ts`: import `GENERAL_SETTINGS_QUERY_KEY` alongside `ME_QUERY_KEY` from `"@/features/shared"`, and set
`general: () => GENERAL_SETTINGS_QUERY_KEY,`. Nothing else changes.

`types/settings.types.ts`, `GeneralSettings`: add after `defaultLanguage: string`:
```ts
  /** Content locales (never empty: the API resolves an unconfigured project to `[defaultLanguage]`). */
  locales: string[]
  /** Content default locale; always one of `locales`. */
  defaultLocale: string
```
`updateGeneralSettings(payload: Partial<GeneralSettings>)` already accepts them.

--------------------------------------------------------------------------
Task 9 — `features/settings/lib/content-languages.ts` (new, pure)
--------------------------------------------------------------------------

```ts
import { isLocaleCode } from "@beechcms/core"

/** Mirrors `MAX_LOCALES` in apps/api/src/features/settings/settings.handler.ts. */
export const MAX_CONTENT_LANGUAGES = 50

export type AddContentLanguageError = "invalid" | "duplicate" | "limit"

export type AddContentLanguageResult =
  | { ok: true; locales: string[] }
  | { ok: false; error: AddContentLanguageError }

/** Appends a trimmed locale code. The grammar is core's (`it`, `en`, `pt-BR`, `es-419`); no case repair. */
export function addContentLanguage(locales: readonly string[], input: string): AddContentLanguageResult {
  const code = input.trim()
  if (!isLocaleCode(code)) return { ok: false, error: "invalid" }
  if (locales.includes(code)) return { ok: false, error: "duplicate" }
  if (locales.length >= MAX_CONTENT_LANGUAGES) return { ok: false, error: "limit" }
  return { ok: true, locales: [...locales, code] }
}

/** Removes `code`, except the default locale (the API requires `defaultLocale ∈ locales`). */
export function removeContentLanguage(locales: readonly string[], defaultLocale: string, code: string): string[] {
  return code === defaultLocale ? [...locales] : locales.filter((locale) => locale !== code)
}

/** The language's name in the UI language (`Intl.DisplayNames`), or the code itself when unavailable. */
export function contentLanguageName(code: string, uiLanguage: string): string {
  try {
    return new Intl.DisplayNames([uiLanguage], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}
```

--------------------------------------------------------------------------
Task 10 — `features/settings/hooks/use-content-languages.ts` (new)
--------------------------------------------------------------------------

Follow `use-general-tab.ts`'s pattern (server sync in `useEffect`, `mutateAsync`, `toast`, error `detail`):
```ts
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useGeneralSettings, useUpdateGeneralSettings } from "./use-settings"
import { addContentLanguage, removeContentLanguage, type AddContentLanguageError } from "../lib/content-languages"

export function useContentLanguages() {
  const { t } = useTranslation()
  const { data: settings, isLoading } = useGeneralSettings()
  const updateSettings = useUpdateGeneralSettings()

  const [locales, setLocales] = useState<string[]>([])
  const [defaultLocale, setDefaultLocale] = useState("")
  const [draft, setDraft] = useState("")
  const [draftError, setDraftError] = useState<AddContentLanguageError | null>(null)

  useEffect(() => {
    if (settings) {
      setLocales(settings.locales)
      setDefaultLocale(settings.defaultLocale)
    }
  }, [settings])

  const isDirty = settings !== undefined && (
    defaultLocale !== settings.defaultLocale || locales.join(",") !== settings.locales.join(",")
  )

  const add = () => {
    const result = addContentLanguage(locales, draft)
    if (!result.ok) {
      setDraftError(result.error)
      return
    }
    setLocales(result.locales)
    setDraft("")
    setDraftError(null)
  }

  const remove = (code: string) => setLocales((current) => removeContentLanguage(current, defaultLocale, code))

  const save = async () => {
    try {
      // Only the two locale keys: the General form owns the other settings and is saved separately.
      await updateSettings.mutateAsync({ locales, defaultLocale })
      toast.success(t("settings.contentLanguages.savedSuccess"))
    } catch (err) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      toast.error(axiosError?.response?.data?.detail ?? t("settings.contentLanguages.savedError"))
    }
  }

  return {
    isLoading,
    isPending: updateSettings.isPending,
    state: { locales, defaultLocale, draft, draftError, isDirty },
    actions: {
      setDraft: (value: string) => { setDraft(value); setDraftError(null) },
      add,
      remove,
      setDefaultLocale,
      save,
    },
  }
}
```
**Save only on explicit click.** The General form's save must keep **not** sending `locales` / `defaultLocale`. Otherwise saving the
timezone would pin an implicit config, and content locales would stop following `defaultLanguage`.

--------------------------------------------------------------------------
Task 11 — `components/content-languages-card.tsx` (new) + `general-tab.tsx`
--------------------------------------------------------------------------

Use the existing shadcn primitives already used by `general-tab.tsx` (`Card*`, `Button`, `Input`, `Label`) plus `Badge`
(`@/components/ui/badge`) and `reicon-react` icons (`Trash2`, `Loader`), exactly as imported elsewhere in the dashboard. Layout:
- `CardHeader`: title `settings.contentLanguages.title`, description `settings.contentLanguages.description`.
- A list with one row per locale, in `state.locales` order. Each row shows `contentLanguageName(code, i18n.language)`, the code in
  `font-mono text-xs text-muted-foreground`, and one of two things. The default row gets a `Badge` with
  `settings.contentLanguages.defaultBadge`. Every other row gets a ghost `Button` with `settings.contentLanguages.makeDefault` →
  `actions.setDefaultLocale(code)`. Every row also gets an icon `Button` with `aria-label={t("settings.contentLanguages.remove", { code })}` →
  `actions.remove(code)`, `disabled` when `code === state.defaultLocale`.
- The add row is an `Input` (`id="content-language-add"`, `Label` `settings.contentLanguages.addLabel`, placeholder
  `settings.contentLanguages.addPlaceholder`, `value={state.draft}`, Enter key → `actions.add()` with `preventDefault`) plus a
  `Button` with `settings.contentLanguages.add`. When `state.draftError` is set, render
  `<p role="alert" className="text-xs text-destructive">{t(\`settings.contentLanguages.errors.${state.draftError}\`)}</p>`.
- The hint `<p className="text-xs text-muted-foreground">` shows `settings.contentLanguages.keptOnRemoveHint`.
- The footer is a `Button` with `settings.contentLanguages.save`, `disabled={!state.isDirty || isPending}`, and a spinner while pending,
  as in `general-tab.tsx`.
- While `isLoading`, render the same centred spinner `general-tab.tsx` uses.

This card is **not** inside the General `<form>`, because nested forms are invalid. In `general-tab.tsx`, render
`<ContentLanguagesCard />` as a second child of the existing `<div className="space-y-6">`, after the first `</Card>`.

--------------------------------------------------------------------------
Task 12 — i18n (`locales/en.json`, `locales/it.json`)
--------------------------------------------------------------------------

Add a sibling of `settings.general`, named `settings.contentLanguages`, in both files. Keys and values:

| key | en | it |
|-----|----|----|
| `title` | Content languages | Lingue dei contenuti |
| `description` | Languages your content can be translated into. The default language is shown wherever a translation is missing. | Lingue in cui i contenuti possono essere tradotti. La lingua predefinita viene mostrata dove manca una traduzione. |
| `defaultBadge` | Default | Predefinita |
| `makeDefault` | Make default | Rendi predefinita |
| `remove` | Remove {{code}} | Rimuovi {{code}} |
| `addLabel` | Add a language | Aggiungi una lingua |
| `addPlaceholder` | e.g. en, fr, pt-BR | es. en, fr, pt-BR |
| `add` | Add | Aggiungi |
| `keptOnRemoveHint` | Removing a language never deletes its translations: they stay stored and come back if you add it again. | Rimuovere una lingua non cancella mai le sue traduzioni: restano salvate e ricompaiono se la aggiungi di nuovo. |
| `errors.invalid` | Use a language code such as "en", "fr" or "pt-BR". | Usa un codice lingua come "en", "fr" o "pt-BR". |
| `errors.duplicate` | This language is already in the list. | Questa lingua è già nell'elenco. |
| `errors.limit` | You can add up to 50 languages. | Puoi aggiungere al massimo 50 lingue. |
| `save` | Save languages | Salva lingue |
| `savedSuccess` | Content languages saved | Lingue dei contenuti salvate |
| `savedError` | Error saving content languages | Errore durante il salvataggio delle lingue dei contenuti |

--------------------------------------------------------------------------
Task 13 — `features/content-management/hooks/use-content-list.ts`
--------------------------------------------------------------------------

```ts
import { useCallback, useEffect } from "react"
import { isLocalizedBranch } from "@beechcms/core"
import { useLocalizeEntryData, useSchema } from "@/features/shared"
import { contentApi, type ContentListQueryParams, type ContentListWithMeta } from "../api/content.api"
```
Inside `useContentList`, after `const { data: seeds } = useSchema()`:
```ts
  const localize = useLocalizeEntryData()
  const seed = seeds?.find((s) => s.slug === slug)
  // Table, gallery cards and the gallery peek all render these items: resolve them once, here. The query
  // cache keeps the raw dictionaries; only this observer's view is flat.
  const select = useCallback(
    (response: ContentListWithMeta): ContentListWithMeta =>
      seed?.branches.some(isLocalizedBranch)
        ? { ...response, items: response.items.map((entry) => ({ ...entry, data: localize(seed, entry.data) })) }
        : response,
    [localize, seed],
  )
```
Pass `select` into the existing `useQuery({...})` options. The relation-priming `useEffect` reads `query.data.relations`, which `select`
preserves. Leave it unchanged.

--------------------------------------------------------------------------
Task 14 — `ContentTrashView.tsx`
--------------------------------------------------------------------------

Import `useLocalizeEntryData` from `"@/features/shared"`. In the component body: `const localize = useLocalizeEntryData()`. Change the
display column accessor to
`accessorFn: (row) => String(localize(seed, row.data)[seed.displayNameAlias ?? "title"] ?? row.id),` and add `localize` to that
`useMemo`'s dependency array.

--------------------------------------------------------------------------
Task 15 — `features/content-kanban/hooks/use-kanban-column-query.ts`
--------------------------------------------------------------------------

Import `useLocalizeEntryData` from `'@/features/shared'` and call it at the top of the hook: `const localize = useLocalizeEntryData()`.
In `cards`, pass `{ ...item, data: localize(seed, item.data) }` instead of `item` to `buildKanbanCardDisplayModel`. Axis values are
never localized, because core `resolveKanbanConfig` excludes localized branches, so drag/drop and optimistic updates are unaffected.

--------------------------------------------------------------------------
Task 16 — `features/bulk-edit/bulk-edit-dialog.tsx`
--------------------------------------------------------------------------

`import { isLocalizedBranch, resolvePolicies } from "@beechcms/core"`, then:
```ts
function isBulkEditable(branch: Branch): boolean {
  // The API refuses localized fields in bulk edit (it cannot merge one value into every locale).
  if (isLocalizedBranch(branch)) return false
  const { visibility, privacy } = resolvePolicies(branch)
  ...unchanged
}
```
Update the doc comment: "…visible, not encrypted, and not localized."

--------------------------------------------------------------------------
Task 17 — `components/fields`: DI slot + relation labels
--------------------------------------------------------------------------

17a. `context.tsx`: `import type { LocaleConfig, Seed } from "@beechcms/core"`. Add the slot after `useSchema`:
```ts
  /**
   * Project content-language config, or `undefined` when no seed has a localized branch. Relation labels
   * resolve a localized display name to the default locale through it. Typically proxies `useLocaleConfig`.
   */
  useLocaleConfig: () => LocaleConfig | undefined
```

17b. `relation-label.ts` (new):
```ts
import { useCallback } from "react"
import { resolveLocalizedValue, type LocaleConfig, type Seed } from "@beechcms/core"
import { useFieldsConfig } from "./context"

/**
 * The raw label of a relation target entry — `data[labelAlias]` — resolved to the default locale when that
 * branch is localized. Callers keep their own string conversion and id/slug fallbacks.
 */
export function relationLabelValue(
  targetSeed: Pick<Seed, "branches"> | undefined,
  data: Record<string, unknown> | undefined,
  labelAlias: string,
  config: LocaleConfig | undefined,
): unknown {
  const raw = data?.[labelAlias]
  const branch = targetSeed?.branches.find((b) => b.alias === labelAlias)
  return branch && config ? resolveLocalizedValue(branch, raw, config.defaultLocale, config) : raw
}

/** `relationLabelValue` bound to `targetSlug`'s seed and the injected locale config. Call before any early return. */
export function useRelationLabel(targetSlug: string | undefined): (data: Record<string, unknown> | undefined, labelAlias: string) => unknown {
  const { useSchema, useLocaleConfig } = useFieldsConfig()
  const { data: seeds } = useSchema()
  const config = useLocaleConfig()
  const targetSeed = seeds?.find((seed) => seed.slug === targetSlug)
  return useCallback(
    (data, labelAlias) => relationLabelValue(targetSeed, data, labelAlias, config),
    [targetSeed, config],
  )
}
```
Place the file next to `context.tsx` (`components/fields/relation-label.ts`). If `components/fields/index.ts` re-exports the context
helpers, do **not** add this file to it. It is internal to the relation fields.

17c. Replace the six reads. Each `useRelationLabel(...)` call goes at the top of its component or hook, before any conditional
`return`:
- `display/relation.tsx` `RelationChip`: `const labelOf = useRelationLabel(targetSlug)`, then `const rawLabel = labelOf(entry?.data, labelAlias)`.
  Do the same in `SingleRelation`. The following string/number/JSON branches stay unchanged.
- `edit/relation/relation-single.tsx`: `const labelOf = useRelationLabel(targetSlug)` next to the `labelAlias` computation. Then
  `String(labelOf(selectedEntry?.data, labelAlias) ?? selectedId)` and, in `resolveLabel`, `const raw = labelOf(item.data, labelAlias)`.
- `edit/relation/relation-multi.tsx`: in `useChipLabel`, `const labelOf = useRelationLabel(targetSlug)` and
  `return String(labelOf(entry?.data, labelAlias) ?? targetId)`. In the component, `const labelOf = useRelationLabel(targetSlug)` and
  `const raw = labelOf(item.data, labelAlias)` in `resolveLabel`.

17d. `App.tsx`: import `useLocaleConfig` from `"@/features/shared"` (the file already imports `useSchema` from there) and add
`useLocaleConfig,` to `fieldsConfig`.

--------------------------------------------------------------------------
Task 18 — Tests
--------------------------------------------------------------------------

Every file follows `_config/testing_conventions.md`: SPDX header; `describe` names the subject; `it` states behaviour + outcome
with no "should"; four zones; status asserted first; typed bodies; no `any`. The fixture seeds below are hand-rolled with
`defineSeed`, exactly as the Sprint 3 suites do, because `@beechcms/testing` has no canonical localized seed. That is the only
deviation from Rule 3.5, and each file's docblock states why. In every integration `beforeEach`, clear `site_settings` and configure
`PUT /api/settings { locales: ['it','en'], defaultLocale: 'it' }` as `public-localization-read.integration.test.ts:L43-48` does,
with the same comment on why the table is cleared.

**T1 — `shared/localization/display-name.test.ts` (unit).** Fake repository `{ getAll: vi.fn() }` (unit tier, like `locale-config.test.ts`).
- `describe('loadDisplayLocaleConfig')`:
  - `returns undefined without reading settings when no seed has a localized display-name branch`. Use two seeds: one localized
    non-display branch, one plain. Assert `getAll` was not called.
  - `resolves the stored settings when one seed's display-name branch is localized`. `getAll` resolves
    `{ locales: ['it','en'], defaultLocale: 'en', defaultLanguage: 'it' }` → `{ locales: ['it','en'], defaultLocale: 'en' }`.
- `describe('resolveDisplayName')`: one matrix `it` (Rule 1.6), `resolves raw and decoded display names to the default locale and leaves
  everything else untouched`. Config `{ locales: ['it','en'], defaultLocale: 'it' }`. Rows:
  raw text `'{"it":"Scarpa","en":"Shoe"}'` → `'Scarpa'`; decoded `{ it: 'Scarpa', en: 'Shoe' }` → `'Scarpa'`; `'{"en":"Shoe"}'` → `'Shoe'`
  (first-translation fallback); legacy `'Vecchio titolo'` → `'Vecchio titolo'`; `null` → `null`; non-localized display branch with
  `'{"it":"x"}'` → unchanged; `config` undefined → unchanged.

**T2 — `features/content/test/integration/content-localized-list.integration.test.ts` (new).** Seeds: `loc_list_brands`
(`displayNameAlias: 'name'`, `name` text localized) and `loc_list_items` (`displayNameAlias: 'title'`, `title` text localized,
`brand_id` relation → `loc_list_brands`). `describe('content slice — localized list (real D1)')`, nested
`describe('GET /api/content/:slug')`:
1. `sorting on a localized field orders by the default-locale value, not the stored JSON text`. ARRANGE: create
   `{title:{it:'Arancia',en:'Orange'}}` and `{title:{it:'Mela',en:'Apple'}}`, then `PUT /api/settings { defaultLocale: 'en' }` (locales
   unchanged). ACT: `GET /api/content/loc_list_items?sortBy=title&sortDir=asc&page=1&limit=10`. ASSERT: 200. The `items` ids are in
   the order Apple-entry, Orange-entry. Comment (regression guard): the stored text starts with `{"it":…`, so raw order gives Orange first.
2. `a filter on a localized field compares the default-locale value`. ARRANGE: same two entries, default `it`. ACT:
   `GET …?page=1&limit=10&filters=` + `encodeURIComponent(JSON.stringify({ title: { columnId: 'title', type: 'text', conditions: [{ op: 'eq', value: 'Mela' }] } }))`.
   Use the condition shape `parseFilterGroup` accepts (`shared/utils/query-utils.ts`). If it requires an `id` on each condition, add
   `id: 'c1'`. ASSERT: 200, `total === 1`, and the one item's id is the Mela entry.
3. `the relations map labels a localized target in the default locale`. ARRANGE: create a brand `{name:{it:'Rosso',en:'Red'}}` and an
   item referencing it. ACT: `GET /api/content/loc_list_items?page=1&limit=10`. ASSERT: 200, and `relations.brand_id[<brandId>] === 'Rosso'`.
   Comment (regression guard): before, this was `String(object)` → `'[object Object]'`.
4. `list items keep the stored dictionaries`. ACT: same GET. ASSERT: `items[0].data.title` `toEqual({ it: 'Arancia', en: 'Orange' })`.
   Comment: the editor and API clients need every translation; only the dashboard view resolves.

**T3 — `draft-localization.integration.test.ts` (extend).** Add `describe('GET /api/content/drafts')` →
`it('titles a pending draft of a localized display name in the default locale')`. The existing `SLUG` seed has `title` localized and
`allowDrafts: true`. ARRANGE: create the entry through the existing helper/route with `{ title: { it: 'Bozza', en: 'Draft' }, status: 'draft' }`.
ACT: `GET /api/content/drafts`. ASSERT: 200, and the row with `id === created` has `title === 'Bozza'`. If the seed's
`displayNameAlias` is not `title` (it is inferred from the first text branch by `POST /api/seeds`, which is `title`), assert on that alias.

**T4 — `features/search/test/integration/search-localization.integration.test.ts` (new).** Seed `loc_search_posts`
(`displayNameAlias: 'title'`, `title` text localized, default search policy). `describe('search slice — localized titles (real D1)')`:
- `a match in any language returns the title in the default locale`. ARRANGE: create `{ title: { it: 'Scarpa rossa', en: 'Red shoe' } }`.
  ACT: `GET /api/search?q=shoe`. ASSERT: 200, and the item with that id has `title === 'Scarpa rossa'`.

**T5 — `features/backrefs/test/integration/backrefs-localization.integration.test.ts` (new).** Seeds: target `loc_br_authors`
(plain `name`), source `loc_br_books` (`displayNameAlias: 'title'`, `title` text localized, `author_id` relation → `loc_br_authors`).
`describe('backrefs slice — localized display names (real D1)')`:
- `a localized source display name is listed in the default locale`. ARRANGE: author, then a book `{ title: { it: 'Il libro', en: 'The book' }, author_id }`.
  ACT: `GET /api/content/loc_br_authors/<authorId>/backrefs`. ASSERT: 200, and `groups[0].items[0].displayName === 'Il libro'`.

**T6 — `features/settings/lib/content-languages.test.ts` (unit).**
- `describe('addContentLanguage')`: a matrix `it` for `rejects invalid codes, duplicates and a full list with a typed error`
  (`'EN'`, `'en_US'`, `''` → `invalid`; `'it'` in `['it']` → `duplicate`; 50 codes → `limit`); `appends a trimmed valid code`
  (`' pt-BR '` → `['it','pt-BR']`).
- `describe('removeContentLanguage')`: `removes a non-default language`; `keeps the default language`.
- `describe('contentLanguageName')`: `names a language in the UI language` (`('en', 'en')` → `'English'`);
  `falls back to the code when the UI language is not a valid tag` (`('fr', '!!')` → `'fr'`: `Intl.DisplayNames` throws a
  `RangeError`, which exercises the `catch`).

**T7 — `features/shared/hooks/use-locale-config.test.tsx` (unit).** `vi.mock("@/lib/api", …)` at the top (Rule 3.9). `api.get`
routes by URL: `/schema` → the seeds under test, `/settings` → `{ locales: ['it','en'], defaultLocale: 'it', defaultLanguage: 'it' }`.
Render with `renderHook` inside a fresh `QueryClientProvider` per test (`retry: false`).
- `describe('useLocaleConfig')`: `requests no settings while no seed has a localized branch` (after `/schema` resolves, assert
  `api.get` was never called with `"/settings"` and the result is `undefined`); `returns the project config once a seed has a localized branch`
  (`waitFor` the result to equal `{ locales: ['it','en'], defaultLocale: 'it' }`).
- `describe('useLocalizeEntryData')`: `resolves localized branches to the default locale and leaves other fields untouched`
  (`{ title: { it: 'Scarpa', en: 'Shoe' }, sku: 'A1' }` → `{ title: 'Scarpa', sku: 'A1' }`).

**T8 — `components/fields/relation-label.test.ts` (unit, pure).** `describe('relationLabelValue')`, one matrix `it`:
localized branch + config → default translation; localized branch + `undefined` config → raw dictionary unchanged; plain branch → raw;
primed plain string on a localized branch (the list's `relations` priming) → the string; unknown alias → `undefined`.

**T9 — `test/cross-slice/content-list-localization.test.tsx` (new).** Mock **only** `@/lib/api`, routing by URL (`/schema`, `/settings`,
`/content/loc_items`). Do not mock `@/features/shared`: the point is the real chain. The seed has a localized `title`, and the list response holds one
item with `{ title: { it: 'Scarpa', en: 'Shoe' } }`. `describe('useContentList — localized items')`:
`it('exposes list items with localized fields resolved to the default locale')` → `waitFor` `result.current.data?.items[0].data.title === 'Scarpa'`.
Add a second `it` with a seed that has no localized branch, `it('makes no settings request when no seed is localized')`: assert
`api.get` was never called with `"/settings"`.

**T10 — `test/cross-slice/bulk-edit-dialog.test.tsx`.** Add `it('does not offer a localized field in the field picker')`, using the
file's existing arrangement with one extra `localized: true` text branch. Assert that its label is absent from the picker and that
a plain sibling is present.

**T11 — fixture completion.** `useLocaleConfig: () => undefined` in the three `FieldsContextType` mocks.
`useLocalizeEntryData: () => (_seed, data) => data` in `content-list-relation.test.tsx`'s `@/features/shared` mock. No assertion changes.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless noted.
```
pnpm --filter @beechcms/core build
cd apps/api && npx tsc -p tsconfig.build.json --noEmit && cd ../..
pnpm --filter @beechcms/api test:unit
pnpm --filter @beechcms/api test:integration
pnpm --filter @beechcms/dashboard type-check
pnpm --filter @beechcms/dashboard test
pnpm beech test --diff
pnpm lint
graphify update . --force
```
No `pnpm beech db:migrate` / `db:reset`: this sprint ships no migration.

Manual runtime check (the reviewer verifies behaviour in the running dashboard, `pnpm beech dev`):
1. Settings → Site: the "Content languages" card lists the implicit language. Add `en`, make it default, save. Reload, and the state
   persists. Remove `it`. Try to remove the default, and the button is disabled. Enter `EN`, and an inline error appears with nothing added.
2. Localize a seed's display-name field through the Seeds API or MCP (the UI toggle is Sprint 5). Write an entry with
   `{it, en}` through the API. Then confirm that the content table, gallery card and peek, kanban card, a relation chip pointing to it,
   the drafts list, the command palette search and the back-refs panel all show the default-language string, never JSON.
3. Sort the table by that field, and the order follows the displayed values.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] Zero changes under `packages/` and under `apps/api/src/{factory.ts,types.ts,middleware,public}`, `apps/api/migrations`,
      `apps/api/src/shared/db`, `apps/api/src/features/{settings,seeds,widget}`, `apps/dashboard/src/features/{seed-builder,entry-editor}`.
- [ ] `display-name.ts` imports only from `@beechcms/core`. `loadDisplayLocaleConfig` never calls `getAll` when no display-name branch in
      `seeds` is localized (T1).
- [ ] `GET /api/content/:slug`: on a seed with a localized branch, sort and filter compare the default-locale value (T2-1, T2-2), and
      `relations` labels are default-locale strings (T2-3). `items[].data` still carries the stored dictionaries (T2-4). On a seed without
      one, `findMany` receives `locale: undefined`.
- [ ] `GET /api/content/drafts`, `GET /api/search` and `GET /api/content/:slug/:id/backrefs` return default-locale titles for localized display
      names (T3, T4, T5), and are unchanged otherwise. Back-refs masking applies after resolution.
- [ ] Dashboard: `useLocaleConfig` issues no `GET /api/settings` unless some seed has a localized branch (T7, T9), and it shares
      `GENERAL_SETTINGS_QUERY_KEY` with the settings slice, so saving languages refreshes every surface.
- [ ] Table, gallery (cards and peek), kanban cards, trash list and relation labels (display and both pickers) render localized values in
      the default locale through core resolvers. No dashboard code parses or walks a dictionary itself.
- [ ] The Entry Editor still receives raw dictionaries (`useContentEntry` / `fetchById` untouched).
- [ ] The bulk-edit field picker omits localized fields (T10).
- [ ] Settings → Site shows "Content languages" to global `manage_users` holders only (existing gating). It adds (with validation),
      removes (never the default), sets the default, and saves only `{ locales, defaultLocale }`. The General form's save payload is unchanged.
- [ ] `en.json` / `it.json` carry every `settings.contentLanguages.*` key from Task 12.
- [ ] No new cross-slice import. The pre-existing `automations → settings` import is untouched and not copied.
- [ ] No `any`, no new dependency, no cast added to satisfy a type guard.
- [ ] Every SECTION 5 command passes. Every new or changed test file conforms to `_config/testing_conventions.md` §8.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify:
- **Seed Builder "Localized" toggle**, including its guards (type, `confidential`/`restricted`, repeater sub-fields): moved to
  Sprint 5 `LocalizedEntryEditor` (ROADMAP §5, VETO §5a).
- **Entry Editor**: the locale selector, per-field fallback indicator, "Copy from default", completion indicator and dictionary-aware
  inputs are all ROADMAP §5.
- **An editor/user locale for lists** or any language picker outside Settings (VETO §4).
- **Resolving `items[].data` server-side** on `GET /api/content/:slug`, or any change to `GET /api/content/:slug/:id` (VETO §4).
- **Widget data API** (`/api/widget/*`: leaderboard label, list rows, display-column search) and **vector index titles**: ROADMAP fast-follows.
- **Moving `useGeneralSettings` to `features/shared`** to fix the pre-existing `automations → settings` import: ROADMAP fast-follow.
- **Facets endpoint** (`/content/:slug/facets`) on localized json tag fields, and **FTS locale-key tokens**: known v1 limits.
- **Any core change**, migration, public API change, SDK change, MCP change, or relabelling of the existing `defaultLanguage` field.
- **Documentation** of the public `?lang` API: a ROADMAP fast-follow, after Sprint 5.
