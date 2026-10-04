# ROADMAP — Field-Level Localization

Source brief: `stages/00_ideation/output/feature_brief.md` (Field-Level Localization).
Planned: 2026-09-25. Graph state at planning time: 21 148 nodes, 31 976 edges.

The feature spans four boundaries that must merge in order: the Botanical Engine contract
(`@beechcms/core`) → the API write path → the API read path + SDK → the dashboard. Each sprint below
is validated on its own before the next is planned. Only the sprint marked **NEXT** has a detailed plan;
the others are roadmap entries until their turn. Their Task Details are written against the codebase
that exists at that point, not today's.

Rollout invariant across the whole series: until Sprint 5 ships, `localized` can be set only through the
Seeds API / manifest / MCP, never from the dashboard UI. That keeps half-shipped states invisible to
non-technical owners. (Originally "until Sprint 4". Moved when Sprint 4 planning moved the Seed Builder toggle
to Sprint 5: the toggle must ship together with an editor that can edit a dictionary.)

---

## 1. `LocalizationCoreContracts` — **DONE** (review PASS; archived: `docs/Sprints/LocalizationCoreContracts/`)

- **Goal:** the Botanical Engine knows what a localized branch is, which ones are legal, and how a
  locale dictionary is validated, stored and indexed.
- **Deliverables:** `Branch.localized`; `engine/localization.ts` (locale-code grammar, `LocaleConfig`,
  dictionary detection, write-patch normalisation, storage compaction); seed-validation Fatal 17
  (type / repeater sub-field / encrypted-hashed storage); payload validation accepts
  `string | dictionary` for localized branches when a `LocaleConfig` is passed (required = default
  locale only); `serializeForDb` / `deserializeFromDb` codec for dictionaries; vector extractor
  indexes every locale; `localized` enters the schema-contract projection; Seeds API refuses to
  retype a localized branch.
- **Depends on:** nothing.

## 2. `LocalizedWritePath` — **DONE** (review PASS; archived: `docs/Sprints/LocalizedWritePath/`)

- **Goal:** content writes through `apps/api` store locale dictionaries without ever losing a
  translation.
- **Deliverables summary:** `site_settings` keys `locales` (JSON array) + `defaultLocale`, exposed and
  validated on `GET/PUT /api/settings` (codes match `LOCALE_CODE_RE`, 1–50 distinct, `defaultLocale ∈
  locales`, both keys persisted together, removing a locale never touches content); core
  `resolveLocaleConfig()` (defaults to `[defaultLanguage]`), `applyLocalizedPatch()` /
  `mergeLocalizedFields()` (locale-key merge, `null` clears one locale, never drops unmentioned or
  unregistered locales, legacy value = default locale), `resolveLocalizedValue()` /
  `resolveLocalizedFields()` (pulled forward from §3: the write path needs them for slugs and titles);
  `requiredOnUpdate` ignores an untouched default locale; uncached `loadLocaleConfig()` in
  `apps/api/src/shared/localization/` (read only for seeds with a localized branch); `localeConfig` + merge
  on content create/update, draft save (merged against draft-or-live), import worker, public add/edit;
  implicit `If-Match` on merged updates; bulk edit, kanban axes and automation `edit_field` refuse
  localized fields.
- **Scope moves vs. the original entry (decided in the plan's VETO audit):** the isolate cache was vetoed
  (invalidating only the isolate that served the PUT leaves every other isolate stale). Kanban no longer gets
  `localeConfig`; localized branches are simply not axis candidates. Bulk no longer merges; it refuses.
- **Depends on:** Sprint 1 (`LocaleConfig`, patch semantics, codec).

## 3. `LocalizedReadNegotiation` — **DONE** (review PASS; archived: `docs/Sprints/LocalizedReadNegotiation/`)

- **Goal:** public reads return a flat, render-ready payload in the negotiated language; filters, sort
  and search operate through the active language.
- **Decisions taken in the plan's VETO audit:** (a) no `LocaleConfig` cache: a version token costs the same
  single D1 read. The read path loads settings only when some seed in the registry has a localized branch.
  The trigger is registry-wide because `?include` / subqueries cross seeds. (b) `public-add` / `public-edit`
  negotiate before writing and answer in the negotiated language. (c) The resolver chain becomes
  requested → default → **first stored translation** → null, in JS and in the SQL twin, so an implicit
  config moved by a `defaultLanguage` change never blanks the site. The edge-cache key carries the resolved
  language (`__beech_lang`), because the Workers Cache API does not key on `Vary`. A malformed `?lang` → 400
  `invalid-lang`; a well-formed unregistered one falls through.
- **Deliverables summary:** consume core `resolveLocalizedValue()` / `resolveLocalizedFields()`
  (shipped in Sprint 2: requested → default → legacy raw value; json dictionaries recognised only when
  ≥1 registered key is present; do not redefine them); `SelectOptions.locale` so
  `buildSelectQuery` addresses localized columns through a guarded
  `CASE WHEN json_valid(col) AND json_type(col) = 'object' THEN COALESCE(json_extract(...)) ELSE col END`;
  public API language negotiation `?lang` → `Accept-Language` → `defaultLocale`; `?lang=all` / `?lang=*`
  returns dictionaries; resolved language in the edge-cache key + `Vary: Accept-Language`; relation
  `include` resolved in the same language; masked-visibility policy applied per resolved value;
  `@beechcms/client` query builder `.lang(code)`. FTS needs no change (triggers already index the raw
  JSON text, i.e. every language).
- **Carried in from Sprint 2 planning:** (a) if the public read hot path needs `LocaleConfig` caching, it
  must be version-token based (like `seedRegistryMiddleware`), never "invalidate on PUT"; (b) the
  `public-add` / `public-edit` response `data` still echoes the validated patch and should be flattened
  to the negotiated language; (c) decide the read fallback when a dictionary has neither the requested nor
  the default locale (e.g. implicit config moved by a `defaultLanguage` change before languages were
  configured): today `resolveLocalizedValue` returns `null`.
- **Depends on:** Sprint 2 (dictionaries exist in storage; `LocaleConfig` loadable per request).

## 4. `LocalizedDashboardRead` — **DONE** (review PASS; archived: `docs/Sprints/LocalizedDashboardRead/`)

Renamed from `LocalizationDashboardSchema`, because the Seed Builder toggle moved to Sprint 5 (see below).

- **Goal:** a non-technical owner manages project languages, and every dashboard read surface shows localized
  content in the project's default language instead of the stored dictionary.
- **Deliverables summary:** Settings → Site → "Content languages" card (add / remove / set default, saves only
  `{ locales, defaultLocale }` through the existing `PUT /api/settings`); `features/shared` `useLocaleConfig` /
  `useLocalizeEntryData` (no settings request unless some seed is localized); localized values resolved in the
  content table, gallery cards and peek, kanban cards, trash list and relation labels (display + pickers, via a
  `FieldsContext.useLocaleConfig` DI slot); the bulk-edit picker hides localized fields; API: the authenticated list
  passes `SelectOptions.locale` (default locale) so sort and filter match the displayed value, and resolves `relations`
  labels; `GET /api/content/drafts`, `GET /api/search` and back-refs resolve localized display names through a new
  `apps/api/src/shared/localization/display-name.ts`. Zero core changes.
- **Decisions taken in the plan's VETO audit:** (a) **the Seed Builder toggle moves to Sprint 5.** The Entry Editor
  cannot edit a dictionary until then, and shipping the toggle first would hand owners a broken editor. (b)
  `GET /api/content/:slug` keeps returning raw dictionaries in `items[].data`. Only SQL comparisons and API-computed
  titles are resolved server-side, and the dashboard resolves the rest at render/select time. (c) Lists show the
  default locale only, with no editor/user locale. (d) The widget data API and vector-index titles are deferred
  (fast-follows below).
- **Depends on:** Sprint 2 (settings API) and Sprint 3 (`SelectOptions.locale`, `resolveLocalizedValue` chain).

## 5. `LocalizedEntryEditor` — **NEXT** (detailed plan: `../LocalizedEntryEditor.md`, planned 2026-09-26; final sprint)

- **Goal:** an owner turns localization on per field, and editors translate content from a single language selector.
- **Deliverables summary:** **Seed Builder "Localizzato" toggle** (moved from Sprint 4). It is shown only for
  top-level `text | richtext | json` branches. It is disabled with an explanation on `confidential` / `restricted`
  fields and inside repeater sub-fields, and cleared when the type or classification changes to an incompatible
  one (the server enforces Fatal 17). One locale selector in the Entry Editor header drives every localized
  field. Each field shows a fallback indicator when the active locale has no value, with "Copia dal valore
  predefinito". The entry card shows a translation-completion indicator. Editor saves send only the touched
  locales or the full dictionary (patch semantics from Sprint 2).
- **Carried in from Sprint 4 planning:** (a) the editor must never send `null` for an untouched localized field:
  `applyLocalizedPatch` treats a top-level `null` as "clear every locale". Today `prepareSubmissionPayload` sends every
  branch in `formData`. (b) Blank json/richtext defaults (`{}`, the empty doc) written under the active locale are
  not "blank" for the fallback chain, so an untouched empty locale must not be sent. (c) The editor keeps using
  `useContentEntry` (raw dictionaries). Do not route it through `useLocalizeEntryData`. (d) The relation-label
  priming in `useContentList` writes partial `{ [labelAlias]: label }` entries into `CONTENT_QUERY_KEYS.detail`,
  the same key the editor reads (a pre-existing hazard). The editor must not trust a primed entry as complete.
- **Decisions taken in the plan's VETO audit:** (a) **zero core and zero API changes.** Exporting core's private
  `isEffectivelyEmpty` was vetoed: it counts an image-only richtext doc as empty, so "send `null` for a blank locale"
  would delete that translation. The editor uses a structural blank rule instead: `""`, `{}`, and a doc made only of
  empty paragraphs. (b) Saves send only the touched locales, `{locale: value | null}`, and never a top-level `null`. (c) The
  completion indicator lives in the editor's locale switcher (`IT 3/3 · EN 1/3`), which reads brief §4's "scheda
  dell'articolo" as the entry's own sheet. List cards are unchanged. (d) The switcher shows locale codes, not names
  (`contentLanguageName` stays in `features/settings`). (e) Disabling localization stays metadata-only. The toggle warns
  when a persisted field of a seed with entries is switched off. (f) `useContentEntry` treats a stub (`updated_at: null`)
  as loading and refetches it. (g) On create, the auto-slug reads the default-locale value of a localized first text field.
- **Depends on:** Sprint 4.

---

## Known v1 limits (decided during planning, not scheduled)

- Bulk edit (`PATCH /api/content/:slug/bulk`) and automation `edit_field` refuse localized fields instead
  of merging per locale (Sprint 2).
- Concurrent draft autosaves of the same entry by two editors are last-writer-wins on the draft row, the
  same as every other draft field today. `publishDraft`'s `live_snapshot_at` guard still protects live.
- The update-path version guard shares the existing OCC granularity (`updated_at` in seconds).
- FTS indexes the raw dictionary text, so locale keys (`it`, `en`) are searchable tokens (Sprint 3).
- An idempotent public-add replay returns the body stored on first execution, in that request's language (Sprint 3).
- SDK row types model single-language reads only; `?lang=all` is a wire-level mode for backoffice/export (Sprint 3).
- A public read on a project with ≥ 1 localized branch costs one `site_settings` read, edge-cache hits
  included, because negotiation precedes the cache lookup (Sprint 3).
- Dashboard read surfaces (lists, cards, relation labels, drafts, search, back-refs) show the project default
  language only. There is no per-user or per-editor list language (Sprint 4).
- The `/content/:slug/facets` tag facets of a localized json field are computed over the stored values (Sprint 4).
- Turning `localized` off keeps every stored dictionary (metadata-only, brief §3). Until it is turned back on, the dashboard
  and the API show that field's stored dictionary as raw text. The Seed Builder warns about this (Sprint 5).
- The translation-completion indicator is shown in the Entry Editor only (the locale switcher), not on list cards. The
  switcher shows locale codes, not language names, and always opens on the default locale (Sprint 5).
- Invalid-JSON and required-field feedback is per field. A `<alias>.<locale>` API error is shown on the field with a locale
  prefix, not on a per-locale input (Sprint 5).

## Fast-follows (outside the sprint series, not scheduled)

- **`create_entry` automation writes a localized `json` value unmerged.** `serializeForDb` detects
  dictionaries by grammar only, so a legacy-shaped value (`{url, alt}`) is compacted as if it were one (blank
  sub-values dropped). Fix: run `mergeLocalizedFields(seed, null, data, config)` in the executor. Source:
  Sprint 2 review, finding 2.
- **`publicEditHandler` response echoes the full `findById` row.** The row is not passed through
  `filterEntryForActor`, so by code reading non-public fields reach a public caller. This is a security
  bugfix unrelated to localization. It was observed while planning Sprint 3 and deliberately left untouched there.
- **Docs:** document `?lang` / `Accept-Language` / `?lang=all`, `Content-Language`, and SDK `.lang()` in the
  public API and client SDK reference once Sprint 5 ships.
- **Widget data API (`/api/widget/*`) returns storage-level values.** The leaderboard `label`, `list` rows (json is not
  even decoded) and the `list` search on the display column all use the raw column, so a localized display name
  shows as JSON in dashboard widgets. Observed while planning Sprint 4 and deliberately left out: the repository is
  storage-level by design, and localizing it needs its own decision.
- **Vector-index titles (`d1-vector.repository.ts:getAllVectors`)** carry the raw display column (JSON text for a
  localized display name). Observed while planning Sprint 4.
- **Pre-existing VSA violation:** `features/automations/.../action-selector.tsx` imports `useGeneralSettings` from
  `@/features/settings`. Fix: move the general-settings query hook to `features/shared` (Sprint 4 already moved its
  query key there as `GENERAL_SETTINGS_QUERY_KEY`). Unrelated to localization.

## Permanently out of scope (from the brief, §5)

Localized system slugs; built-in machine translation; dashboard UI i18n; per-language RBAC; nested/partial
translation inside `json`; localization of `number | boolean | date | file | tags | relation | repeater`;
localization of `confidential` / `restricted` fields; orphan-locale purge tool; multi-currency.
