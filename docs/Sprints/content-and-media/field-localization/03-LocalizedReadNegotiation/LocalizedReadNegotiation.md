# Sprint: LocalizedReadNegotiation

Sprint 3 of 5 of **Field-Level Localization** (roadmap: `backlog/ROADMAP.md`).
Public reads return a flat payload in the negotiated language. Filters, sort and relation subqueries on
localized fields compare the value in that language.
Sprint 2 (`LocalizedWritePath`, archived in `docs/Sprints/LocalizedWritePath/`, review PASS) stores locale
dictionaries on every write path and ships the core resolvers `resolveLocalizedValue` /
`resolveLocalizedFields`. No read path uses them yet. Today the Public API returns the raw dictionary
(`{"it":"Scarpa","en":"Shoe"}`), and a filter or `orderBy` on a localized field runs against the raw JSON text.
This sprint adds language negotiation to the Public API. It resolves every localized value in the response,
in `?include`d targets too. It teaches `buildSelectQuery` to address localized columns in one language, and
gives the SDK a `.lang(code)` method.
A project with no localized branch behaves exactly as it does today: no extra D1 read, the same cache key and
no new header.

---

### Pre-Computation Analysis

Graph refreshed first with `graphify update . --force` (21 579 nodes, 32 490 edges, 2 078 communities). It
includes Sprint 1 and Sprint 2 working-tree code (`engine/localization.ts`, `shared/localization/`).

#### a) God Nodes identified via CLI

| Node | Degree | Source | Role in this sprint |
|------|--------|--------|---------------------|
| `createBeechApp()` | **82** | `apps/api/src/factory.ts:L117` | Composition root. **Not touched.** No middleware, route or registration-order change. `seedRegistry` and `siteSettingsRepository` already reach every public request (steps 1 and 2 below). |
| `D1ContentRepository` | **53** | `apps/api/src/shared/db/repositories/content.repository.d1.ts:L119` | **Not touched.** `findMany` passes `SelectOptions` through to `buildSelectQuery` unchanged, three times: page, count, multi-relation ids. `prepareBlindIndexOptions` spreads the options, so a new `locale` key survives untouched. |
| `publicReadHandler()` | 19 | `apps/api/src/public/public-read.ts:L14` | Negotiates the language before the edge-cache lookup. The resolved language enters the cache key. Sets `Vary` / `Content-Language`. Passes the language down. |
| `FluentQueryBuilder` | 19 | `packages/client/src/query-builder.ts:L16` | Gains `.lang(code)`. |
| `toFlatPublicEntry()` | 10 | `apps/api/src/public/entry-projection.ts:L14` | Resolves localized fields **before** public policies, so masking applies to the resolved value. |
| `buildSelectQuery()` | 9 | `packages/core/src/engine/query.ts:L36` | Gains `SelectOptions.locale`. When set, the column reference of a localized branch in WHERE and ORDER BY becomes a self-contained SQL expression. |
| `expandRelations()` | 8 | `apps/api/src/public/relation-include.ts:L12` | Resolves included targets in the same language. |
| `resolveLocalizedFields()` / `resolveLocalizedValue()` | 8 / 5 | `packages/core/src/engine/localization.ts:L237 / L221` | Consumed, not redefined (roadmap rule). `resolveLocalizedValue` gains one final fallback step (decision (c), VETO §5). |
| `resolveRelationSubqueries()` | 7 | `apps/api/src/public/relation-subquery.ts:L29` | Its inner `findMany` on the target seed receives the same `locale`. |
| `filterEntryForActor()` | 5 | `packages/core/src/engine/policies.ts:L146` | The `masked` rule masks each translation of a dictionary. Today it returns `null` for any object. |

#### b) Architectural boundaries affected

| Boundary | Touched? | Exact surface |
|----------|----------|---------------|
| `@beechcms/core` — `engine/localization.ts` | **Yes** | `resolveLocalizedValue` adds a final fallback: first stored translation. New pure exports: `asLocaleDictionary`, `asLocaleDictionaries`. |
| `@beechcms/core` — `engine/types.ts` | **Yes** | New `SelectLocale` interface. `SelectOptions.locale?: SelectLocale`. |
| `@beechcms/core` — `engine/query.ts` | **Yes** | Private `localizedColumnSql()` / `columnSql()`, used by the filter loop and ORDER BY. No new export. |
| `@beechcms/core` — `engine/policies.ts` | **Yes** | `filterEntryForActor` masked rule, per translation. |
| `@beechcms/core` — `serialize.ts`, DDL, FTS triggers, seed-validation, schema-fingerprint, vector extractor | **No** | FTS triggers already index the raw JSON text, i.e. every language (ROADMAP §3). |
| `apps/api/public` | **Yes** | New `public-language.ts`. Changed: `public-read.ts`, `read-list.ts`, `read-single.ts`, `entry-projection.ts`, `relation-include.ts`, `relation-subquery.ts`, `public-add.ts`, `public-edit.ts`. |
| `apps/api/shared/localization/locale-config.ts` | **No** | Reused as-is by `public-add` / `public-edit`. The read path calls core `resolveLocaleConfig` directly, because its trigger is registry-wide, not per-seed (VETO §4). |
| `apps/api` — `factory.ts`, `types.ts`, `middleware/`, `D1ContentRepository`, migrations, every `features/*` slice | **No** | Zero files. |
| `@beechcms/client` | **Yes** | `types.ts` (`ListQuery.lang`, `FluentQuery.lang`), `query-builder.ts`. |
| `apps/dashboard`, `api-client`, `mcp`, `cli`, `testing` | **No** | Zero files. |

Middleware registration order that a public read traverses (read from `factory.ts`, **unchanged**):
1. `repositoryMiddleware` (L129) injects `repository`, `siteSettingsRepository`, …
2. `seedRegistryMiddleware` (L143) injects `seedRegistry`, `getSeed`, `backrefMap`. It already does one
   version-token D1 read per request.
3. `storageMiddleware`, `queueMiddleware`, `authProvidersMiddleware`, `rateLimiterMiddleware`,
   `observabilityMiddleware` (L146–154).
4. CORS (L156). `Accept-Language` is a CORS-safelisted request header and `Content-Language` a
   safelisted response header, so `allowHeaders` needs no change.
5. Security headers (L197), analytics (L208).
6. `apiPublic`: `schemaRevisionMiddleware` → `publicRateLimitMiddleware` → `apiKeyMiddleware` → `publicRoutes`
   (L266–269), mounted at `/api/v1/public` (L273).

#### c) `graphify affected` impact analysis (breaking-change proof)

```
$ graphify affected "engine_query_buildselectquery" --depth 2
- .findMany()            [calls]   apps/api/src/shared/db/repositories/content.repository.d1.ts:L322
- query.test.ts          [imports] packages/core/src/engine/query.test.ts:L1

$ graphify affected "toFlatPublicEntry()" --depth 2
- readSingleEntry() read-single.ts:L27, readListEntries() read-list.ts:L22,
  expandRelations() relation-include.ts:L12, publicReadHandler() public-read.ts:L14
- entry-projection.test.ts, public-read.test.ts, relation-include.test.ts

$ graphify affected "expandRelations()" --depth 2
- readListEntries(), readSingleEntry(), publicReadHandler(); relation-include.test.ts, public-read.test.ts

$ graphify affected "resolveRelationSubqueries()" --depth 2
- readListEntries() read-list.ts:L22 → publicReadHandler(); relation-subquery.test.ts

$ graphify affected "filterEntryForActor()" --depth 2
- applyPublicPolicies()/toFlatPublicEntry() public/entry-projection.ts
- applyVisibility() shared/policies/apply-policies.ts:L58
- getByIdHandler()/getBySlugHandler() content/handlers/get.ts, list.ts, trash.ts, export-stream.ts,
  draft/draft.handler.ts; policies.test.ts, apply-policies.test.ts

$ graphify affected "resolveLocalizedValue()" --depth 2
- resolveLocalizedFields() → createHandler() create.ts:L29, updateHandler() update.ts:L32,
  publicAddHandler() public-add.ts:L134, publicEditHandler() public-edit.ts:L185; localization.test.ts, update.test.ts

$ graphify affected "withCachedResponse()" --depth 2
- publicReadHandler() only; cache-utils.test.ts (src + apps/api/test)

$ graphify affected "buildSearchParams()" / "FluentQueryBuilder" --depth 2
- browser/client.ts, server/client.ts, index re-exports, query-builder.test.ts
```

**Breaking-change verdict: none for a project without a localized branch, and none for any non-localized column.**
- `SelectOptions.locale` is optional. When it is absent, `buildSelectQuery` emits byte-identical SQL. The new
  `columnSql()` returns exactly today's column reference for every column that is not a localized branch.
  T2 pins this.
- `loadPublicLanguage` returns `language: undefined` when no seed in the registry has a localized branch. The
  read then keeps `context.req.raw` as its cache key, sets no header and passes `language: undefined` down.
  `toFlatPublicEntry` / `expandRelations` / `resolveRelationSubqueries` then run today's code, because their
  new trailing parameters are optional. `?lang` is ignored, never validated, in that case. T4 and T7 prove
  that no `site_settings` read happens.
- `filterEntryForActor` changes one case: a `masked` localized branch whose value is a locale dictionary.
  That value exists only for seeds made localized through the Seeds API, because the dashboard toggle only
  arrives in Sprint 4. Every authenticated consumer listed above passes such values today and receives `null`.
  After this sprint it receives the per-translation mask. That is strictly less surprising, and no current
  test covers it.
- `resolveLocalizedValue` changes one case: a dictionary with neither the requested nor the default locale.
  It now returns the first stored translation instead of `null`. The write-path callers (`create`, `update`,
  `public-add`, `public-edit`) use it only to derive slugs and activity titles. Before, such an entry was
  slugged from a random id or `finalSlug`. Now it is slugged from its only translation. One existing
  unit-matrix row pins the old contract and must change. See VETO §5 and T1: this is a contract change,
  not a test bent to fit the code.
- `publicAddHandler` / `publicEditHandler` responses: the `data` of a seed with a localized branch shows each
  localized field resolved to the negotiated language instead of the raw patch or dictionary (carried-in
  item (b)). Non-localized seeds: unchanged, because `loadLocaleConfig` returns `undefined`.
- `@beechcms/client`: additive (`ListQuery.lang`, `.lang()`). `buildSearchParams` emits `lang` only when it is set.

**VSA boundary proof:**
```
$ graphify path "readListEntries()" "buildSelectQuery()"
  readListEntries() --calls--> expandRelations() --calls--> resolvePublicRelationTarget() --calls-->
  resolvePolicies() --calls--> resolveClassification() <--calls-- buildSelectQuery()
$ graphify path "loadLocaleConfig()" "publicReadHandler()"
  loadLocaleConfig() <--calls-- createHandler() --calls--> publicProblem() <--calls-- publicReadHandler()
```
The public slice reaches SQL only through `repository.findMany` → core `buildSelectQuery`. The only link
between `shared/localization` and the read path is a sibling caller, and the read path does not import
`loadLocaleConfig`. The second path runs through an existing pattern: `features/*` import
`public/problem-details`. That dependency predates this sprint and is neither added to nor used here. Every
new file and import in this sprint stays inside `apps/api/src/public/` or `@beechcms/core`.

---

### VETO Audit

**1. THE BOTANICAL INVARIANT — no D1 query bypasses `@beechcms/core`.**
- ✅ The only new SQL is the localized-column expression, generated inside core `buildSelectQuery`, and it
  reaches D1 only through `D1ContentRepository.findMany`. `apps/api` writes no SQL.
- ✅ The only new D1 access on the read path is the existing `D1SiteSettingsRepository.getAll`
  (`SELECT key, value FROM site_settings`), via `context.get('siteSettingsRepository')`.
- ✅ No hardcoded field names. Every rule keys on `isLocalizedBranch(branch)` over `seed.branches`. The SQL
  expression takes the alias from the branch definition, already validated by `isValidColumn`, and qualifies
  it with the table.
- ✅ Injection: locale codes are **inlined** into JSON paths (`'$."pt-BR"'`) and into `key IN (…)`. Every code
  is re-checked with `isLocaleCode` at the build site, and the function throws before any SQL exists (T2f).
  Sprint 1 designed `LOCALE_CODE_RE` as exactly this guard (`localization.ts:L16-20`). Inlining rather than
  binding is deliberate: `buildFilterCondition` emits `col` more than once per clause (`is_empty`, tag ops),
  so a bound expression would need its bindings duplicated in lockstep.

**2. VSA ENFORCEMENT — zero cross-feature imports.**
- ✅ Negotiation, cache key and headers serve only the public slice, so `public-language.ts` lives in
  `apps/api/src/public/`. YAGNI: no second consumer exists, so the code stays in the one slice that uses it,
  with no `shared/` or core move.
- ✅ Pure localization logic (`asLocaleDictionary`, SQL twin, masking) goes to core. That keeps one source of
  truth next to `resolveLocalizedValue`, which Sprint 4 will reuse for the dashboard.
- ✅ Tests mirror placement: unit next to source (`public-language.test.ts`, `entry-projection.test.ts`),
  integration under `public/test/integration/`.

**3. CLOUDFLARE PURITY.**
- ✅ No migration, no table, no index, no KV, no background job. FTS needs no reindex.
- ✅ Edge cache: the Workers Cache API keys on the request URL and does not key on `Vary: Accept-Language`,
  so the resolved language goes **into the cache key URL** (`__beech_lang=<code|*>`). `Vary` is still sent for
  downstream HTTP caches and browsers.

**4. YAGNI — rejected alternatives.**
- ❌ **VETOED: a `LocaleConfig` cache (isolate or version-token).** A version token is itself one indexed D1
  read, and `site_settings.getAll` is one small read of the same cost. A token would add a table column or row
  and an invalidation path for zero saved round-trips. Carried-in item (a) says to cache only if the hot path
  needs it: it does not. Decision: uncached, one read per public request **only when the registry contains a
  localized branch**, cache hits included, because negotiation must run before the cache lookup.
- ❌ **VETOED: per-seed trigger (`loadLocaleConfig(seed)`) on the read path.** A non-localized parent can
  `?include` a localized target or filter one through a relation subquery. A per-seed trigger would leave
  those unresolved or compare them raw. The registry-wide check (`seedRegistry.all().some(...)`) is in-memory
  and exact: a project is language-dependent iff some branch is localized.
- ❌ **VETOED: keying the cache on the raw `Accept-Language` header.** Unbounded cardinality. The key uses
  the negotiated locale only (≤ 50 values + `*`).
- ❌ **VETOED: `Content-Language`-aware SDK typing for `?lang=all`.** `.lang()` is typed as a single-language
  request. `all` stays a wire-level mode for backoffice/export (brief §4), not modelled in `TRow`.
- ❌ **VETOED: extending `GET /:seed/schema` with `localized` flags / project locales.** No user story needs it.
- ❌ **VETOED: fixing the `create_entry` automation's grammar-only dictionary detection here.** Sprint 2
  review, finding 2. It is a write-path gap, so it is filed as a ROADMAP fast-follow, not folded into a read
  sprint.

**5. Carried-in decisions (ROADMAP §3).**
- **(a) Caching:** see §4, none.
- **(b) Public write responses:** `public-add` / `public-edit` negotiate the language from `?lang` /
  `Accept-Language` **before** writing: a malformed `?lang` → 400, nothing written. They answer with the
  stored value resolved to that language. An idempotent replay returns the body stored on first execution,
  in the first request's language. That is correct for an idempotency key, and it is recorded as a known limit.
- **(c) Neither requested nor default locale:** the chain becomes *requested → default → first stored
  translation (stored key order) → null*. Reason: an implicit config (`locales` never set) follows
  `defaultLanguage`. Changing `defaultLanguage` from `it` to `en` before configuring languages would otherwise
  blank every localized field on the public site, which is data loss from the reader's point of view (brief §2).
  The SQL twin applies the same step, so filters and sort agree with the response. Trade-off: a dictionary
  whose registered locales are all missing surfaces an orphan translation. That is accepted, because showing
  it beats showing nothing and matches "removing a language never hides data".

**6. Pre-existing issue observed, NOT fixed here (reported, out of scope):**
`publicEditHandler` answers with `{ ...entry, ...updateData }`, where `entry` is the full `findById` row,
without `filterEntryForActor`. By code reading, that echoes non-public fields to a public caller. This sprint
only wraps that object in `localizePublicEntry`, which leaves its keys unchanged. The fix is a separate
security bugfix; see SECTION 7.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

After Sprint 2, localized content is stored correctly but read back as raw JSON dictionaries. Any frontend
reading the Public API gets `{"it":…,"en":…}` where it expects a string. That breaks every template the
moment an owner localizes a field through the Seeds API. Filters and sort on those fields compare against
JSON text, so they return wrong pages. Reads must be correct before Sprint 4 exposes the "Localizzato"
toggle to non-technical owners in the dashboard. After that point the toggle is one click away, and every
public site on the project would break silently.

This sprint is the read-side counterpart of Sprint 2 and uses the same boundaries:
- **Botanical Engine first.** Language resolution (`resolveLocalizedValue`, `asLocaleDictionary`) and its
  SQL twin (`localizedColumnSql` inside `buildSelectQuery`) live in `@beechcms/core`, next to the write-path
  primitives. The API never builds SQL and never parses a dictionary itself.
- **VSA.** HTTP concerns (negotiation, cache key, headers) live in the one slice that serves them,
  `apps/api/src/public/`. No `features/*` slice changes. The SDK change is one method.
- **Invisible to a mono-lingual project.** The trigger is "some branch is localized". Without one, there is
  no settings read, no header and no cache-key change.

Sprint 4 (dashboard) depends on the core resolver semantics fixed here: decision (c) and
`asLocaleDictionary`.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Context variables** (`AppEnv.Variables`, `apps/api/src/types.ts`, unchanged): `repository`
(`ContentRepository`), `siteSettingsRepository` (`ISiteSettingsRepository`, used by `public-add` /
`public-edit` since Sprint 2), `seedRegistry` (`ISeedRegistry`, `.all()`), `getSeed`.

**Middleware order:** see Pre-Computation (b). Unchanged.

**Public read flow today** (`public-read.ts`):
1. `getSeed(slug)`, then 404 `seed-not-found`.
2. `checkPublicOperation(seed, 'read')`, then 403 `operation-not-allowed`.
3. `resolveEdgeCache(context)`; `cacheKey = context.req.raw`; `cache.match` → return hit.
4. `id | slug` → `readSingleEntry` → `repository.findById | findBySlug` → `toFlatPublicEntry(entry, seed, fields)`
   → `expandRelations([data], include, …, [entry])`.
5. otherwise `readListEntries`: `parsePublicFilter` → `resolveRelationSubqueries` (inner `findMany` on the
   target seed) → `toEngineFilters` → `repository.findMany(seed, { filters, filterLogic, search, status,
   pagination, orderBy })` → `toFlatPublicEntry` per item → `expandRelations`.
6. `withCachedResponse(edgeCache, cacheKey, context.json(...))`: clones the response, adds
   `Cache-Control: public, max-age=60`, `cache.put` via `waitUntil`. It copies every response header.
7. Errors whose message starts with `Invalid subquery:` / `Invalid filter:` / `Invalid include:` become 400.

**`toFlatPublicEntry`** = `filterEntryForActor(data, seed, { type: 'public' })`, then `?fields` projection.
`filterEntryForActor` masks with `typeof value === 'string' && value.length > 0 ? '••••••••' : null`. A
dictionary is an object, so a masked localized field currently becomes `null`.

**`buildSelectQuery`** (`query.ts:L36`): for each filter group, `col = SYSTEM_COLUMNS.has(c) ? `${table}.${c}` : c`
(bare alias). Encrypted branches (`storage === 'encrypt'`) redirect `eq/neq/in/not_in` to `${table}.${c}_bidx`.
ORDER BY uses the same bare-alias rule. `buildFilterCondition(col, type, cond, bindings)` interpolates `col`,
up to twice per clause (`is_empty`), plus inside `json_each(col)` / `json_type(col)` for tag ops.

**Storage shapes of a localized column** (Sprint 1 codec, `serialize.ts:L88-159`):
- dictionary → compact JSON text `{"it":"Scarpa","en":"Shoe"}`. Blank entries are removed on write, and an
  all-blank dictionary is stored as SQL `NULL`.
- legacy value written before the branch was localized: plain text (`text`), a richtext envelope / TipTap
  doc (`richtext`, JSON object whose keys include `schemaVersion`/`type`/`content`), any JSON (`json`).
- `deserializeFromDb` returns a dictionary object for dictionaries and the legacy value unchanged.

**Core resolver today** (`localization.ts:L221-252`): `resolveLocalizedValue` = requested → default → `null`
for a dictionary. It returns the raw value for a legacy value. Dictionary detection (`isStoredLocaleDictionary`,
private): text/richtext = every key matches `LOCALE_CODE_RE`; json = additionally ≥ 1 **registered** key.

**FTS** (`ddl.ts:L339-375`): triggers copy the raw column text of `text`/`richtext` branches that are
public and searchable into `fts_{slug}`. A dictionary is therefore indexed in every language. `?search` keeps
working with no change. Known v1 limit: the locale keys themselves (`it`, `en`) are tokens.

**SDK** (`packages/client`): `FluentQueryBuilder` accumulates a `ListQuery`, and `buildSearchParams`
serialises it (`filter`, `orderBy`/`orderDir`, `search`, `fields`, `include`, `latest`, `page`, `limit`).
Both the browser and server clients use it for `list` / `first`.

**Test harness facts used below:** `createTestHarness({ db: env.DB, seeds, createApp })`,
`harness.anonymous().withHeaders({ 'X-API-Key': TEST_PUBLIC_READ_KEY | TEST_PUBLIC_WRITE_KEY })`.
`PUBLIC_PUBLISHED_ONLY` defaults to published-only, so read fixtures are created with `status: 'published'`.
`site_settings` is **not** reset between tests (Sprint 2 T12 comment), so every suite that configures
locales first runs `DELETE FROM site_settings`. In integration, `executionCtx` is absent, so
`resolveEdgeCache` returns `null`. The cache key is therefore unit-tested (T4), not integration-tested.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Production (15 files: 4 core, 9 api, 2 client):

| # | File | Change |
|---|------|--------|
| 1 | `packages/core/src/engine/localization.ts` | `resolveLocalizedValue` final fallback; new `asLocaleDictionary`, `asLocaleDictionaries`. |
| 2 | `packages/core/src/engine/types.ts` | New `SelectLocale`; `SelectOptions.locale?`. |
| 3 | `packages/core/src/engine/query.ts` | Private `LOCALE_KEY_GLOBS`, `localizedColumnSql`, `columnSql`; used by the filter loop and ORDER BY. |
| 4 | `packages/core/src/engine/policies.ts` | Masked rule masks each translation of a localized dictionary. |
| 5 | `apps/api/src/public/public-language.ts` | **New.** Negotiation, Accept-Language parsing, registry trigger, `loadPublicLanguage`, `selectLocaleOf`, `localizePublicEntry`, `languageCacheKey`, `setLanguageHeaders`. |
| 6 | `apps/api/src/public/public-read.ts` | Negotiate → 400 `invalid-lang` → language cache key → headers → pass `language`. |
| 7 | `apps/api/src/public/read-list.ts` | `language` input; `locale` to `findMany` and to `resolveRelationSubqueries`; language to projection and include. |
| 8 | `apps/api/src/public/read-single.ts` | `language` input; to projection and include. |
| 9 | `apps/api/src/public/entry-projection.ts` | `toFlatPublicEntry(data, seed, fieldsParam?, language?)`: localize, then policies, then projection. |
| 10 | `apps/api/src/public/relation-include.ts` | Trailing `language?` parameter; targets projected in that language. |
| 11 | `apps/api/src/public/relation-subquery.ts` | Trailing `locale?` parameter; forwarded to the target `findMany`. |
| 12 | `apps/api/src/public/public-add.ts` | Negotiate before writing; response `data` resolved to the language. |
| 13 | `apps/api/src/public/public-edit.ts` | Same as #12. |
| 14 | `packages/client/src/types.ts` | `ListQuery.lang?`, `FluentQuery.lang()`. |
| 15 | `packages/client/src/query-builder.ts` | `.lang()`; `buildSearchParams` emits `lang`. |

Tests (T1–T8, see Task 12):

| # | File | Tier |
|---|------|------|
| T1 | `packages/core/src/engine/localization.test.ts` (extend) | unit |
| T2 | `packages/core/src/engine/query.test.ts` (extend) | unit |
| T3 | `packages/core/src/engine/policies.test.ts` (extend) | unit |
| T4 | `apps/api/src/public/public-language.test.ts` (**new**) | unit |
| T5 | `apps/api/src/public/entry-projection.test.ts` (extend) | unit |
| T6 | `packages/client/src/query-builder.test.ts` (extend) | unit |
| T7 | `apps/api/src/public/test/integration/public-localization-read.integration.test.ts` (**new**) | integration |
| T8 | `apps/api/src/public/test/integration/public-localization-write.integration.test.ts` (extend) | integration |

No other file is touched. In particular: no migration, no `factory.ts` / `types.ts` / `middleware/`, no
`D1ContentRepository`, no `features/*`, no dashboard, no docs site (see SECTION 7).

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

No D1 DDL in this sprint: no `CREATE TABLE`, no `CREATE INDEX`, no migration file. The only SQL produced is
the expression in Task 3, generated at query-build time.

---

#### Task 1 — `packages/core/src/engine/localization.ts`

**1a. Replace `resolveLocalizedValue`** (L216-231) with:

```ts
/**
 * Resolves a stored localized value to one language: the requested locale, then the default locale, then the
 * first stored translation (stored key order), then `null`. A legacy value that is not a dictionary is returned
 * as-is. Non-localized branches return `value` unchanged. `buildSelectQuery` applies the same chain in SQL, so
 * filters and ORDER BY compare exactly what a reader sees.
 */
export function resolveLocalizedValue(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  locale: string,
  config: LocaleConfig,
): unknown {
  if (!isStoredLocaleDictionary(branch, value, config)) return value
  if (!isBlankLocaleValue(value[locale])) return value[locale]
  if (!isBlankLocaleValue(value[config.defaultLocale])) return value[config.defaultLocale]
  // An implicit config follows `defaultLanguage`; changing it before languages are configured leaves every
  // dictionary without its default key. Returning null there would blank the public site (brief §2).
  const firstStored = Object.values(value).find((translation) => !isBlankLocaleValue(translation))
  return firstStored ?? null
}
```

**1b. Add, after `resolveLocalizedFields`:**

```ts
/**
 * The whole dictionary of a stored localized value, for readers asking every language (`?lang=all`):
 * a stored dictionary as-is — unregistered locales included, nothing is hidden (brief §2) — a legacy value
 * as `{ [defaultLocale]: value }` (the write path's reading of it), a blank value as `null`.
 * Non-localized branches return `value` unchanged.
 */
export function asLocaleDictionary(
  branch: Pick<Branch, 'type' | 'localized'>,
  value: unknown,
  config: LocaleConfig,
): unknown {
  if (!isLocalizedBranch(branch)) return value
  if (isStoredLocaleDictionary(branch, value, config)) return value
  return isBlankLocaleValue(value) ? null : { [config.defaultLocale]: value }
}

/** Returns a copy of `data` with every localized branch it carries passed through {@link asLocaleDictionary}. */
export function asLocaleDictionaries(
  seed: Pick<Seed, 'branches'>,
  data: Record<string, unknown>,
  config: LocaleConfig,
): Record<string, unknown> {
  const expanded: Record<string, unknown> = { ...data }
  for (const branch of seed.branches) {
    if (isLocalizedBranch(branch) && Object.hasOwn(expanded, branch.alias)) {
      expanded[branch.alias] = asLocaleDictionary(branch, expanded[branch.alias], config)
    }
  }
  return expanded
}
```

Imports unchanged (`./types.js`, `./validation/primitives.js`). `packages/core/src/index.ts` already has
`export * from './engine/localization.js'`, so there is nothing to add.

---

#### Task 2 — `packages/core/src/engine/types.ts`

Add at the top of the file, next to the existing imports (type-only, so no runtime cycle;
`localization.ts` imports only types from this file):

```ts
import type { LocaleConfig } from './localization.js'
```

Add immediately **before** `export interface SelectOptions`:

```ts
/** The language a read resolves localized branches to (consumed by `buildSelectQuery`). */
export interface SelectLocale {
  /** Locale that filters and ORDER BY compare in. Must match `LOCALE_CODE_RE`; the builder throws otherwise. */
  readonly code: string
  readonly config: LocaleConfig
}
```

Add as the last member of `SelectOptions`:

```ts
  /**
   * When set, filters and ORDER BY on localized branches compare the value resolved to `locale.code`
   * (requested → default → first stored translation → legacy raw value) instead of the stored JSON.
   * Absent: every column is compared raw, exactly as before localization existed.
   */
  locale?: SelectLocale
```

---

#### Task 3 — `packages/core/src/engine/query.ts`

**3a. Imports.** Change the type import to include `SelectLocale`, and add:

```ts
import { isLocaleCode, isLocalizedBranch } from './localization.js'
```

**3b. Add below the imports:**

```ts
/** SQLite GLOB twins of `LOCALE_CODE_RE` (`it`, `ast`, `pt-BR`, `es-419`, …). Keep both in sync. */
const LOCALE_KEY_GLOBS = [
  '[a-z][a-z]',
  '[a-z][a-z][a-z]',
  '[a-z][a-z]-[A-Z][A-Z]',
  '[a-z][a-z][a-z]-[A-Z][A-Z]',
  '[a-z][a-z]-[0-9][0-9][0-9]',
  '[a-z][a-z][a-z]-[0-9][0-9][0-9]',
]

/** A locale code checked for inlining into SQL. The grammar check IS the injection guard — never skip it. */
function inlineLocale(code: string): string {
  if (!isLocaleCode(code)) throw new TypeError(`Invalid locale code '${code}'`)
  return code
}

/**
 * SQL twin of `resolveLocalizedValue`: the value of a localized column in `locale.code`. Self-contained
 * (no bindings), because `buildFilterCondition` may interpolate a column more than once per clause.
 * The nested CASE is deliberate: SQLite does not guarantee AND short-circuits, and `json_type` /
 * `json_each` raise on malformed JSON (a legacy plain-text value).
 * Dictionary detection mirrors `isStoredLocaleDictionary`: a non-empty object whose keys all match the
 * locale grammar, and — for `json` only — at least one registered locale key.
 */
function localizedColumnSql(column: string, branch: Branch, locale: SelectLocale): string {
  const keyIsLocale = LOCALE_KEY_GLOBS.map((glob) => `key GLOB '${glob}'`).join(' OR ')
  const conditions = [
    `json_type(${column}) = 'object'`,
    `EXISTS (SELECT 1 FROM json_each(${column}))`,
    `NOT EXISTS (SELECT 1 FROM json_each(${column}) WHERE NOT (${keyIsLocale}))`,
  ]
  if (branch.type === 'json') {
    const registered = locale.config.locales.map((code) => `'${inlineLocale(code)}'`).join(', ')
    conditions.push(`EXISTS (SELECT 1 FROM json_each(${column}) WHERE key IN (${registered}))`)
  }
  const path = (code: string) => `'$."${inlineLocale(code)}"'`
  const resolved = `COALESCE(` +
    `NULLIF(json_extract(${column}, ${path(locale.code)}), ''), ` +
    `NULLIF(json_extract(${column}, ${path(locale.config.defaultLocale)}), ''), ` +
    `(SELECT value FROM json_each(${column}) WHERE value IS NOT NULL AND value != '' LIMIT 1))`
  return `(CASE WHEN json_valid(${column}) THEN ` +
    `(CASE WHEN ${conditions.join(' AND ')} THEN ${resolved} ELSE ${column} END) ` +
    `ELSE ${column} END)`
}

/**
 * The SQL reference for `alias` in WHERE / ORDER BY: table-qualified system column, localized expression
 * when `locale` is set, bare alias otherwise (unchanged pre-localization behaviour).
 */
function columnSql(seed: Seed, table: string, alias: string, locale: SelectLocale | undefined): string {
  if (SYSTEM_COLUMNS.has(alias)) return `${table}.${alias}`
  const branch = seed.branches.find((b) => b.alias === alias)
  if (locale && branch && isLocalizedBranch(branch)) {
    return localizedColumnSql(`${table}.${alias}`, branch, locale)
  }
  return alias
}
```

Notes for the executor:
- `NULLIF(…, '')` is enough for "blank": the write path compacts whitespace-only and empty entries away
  (`compactLocalizedDictionary`). A stored dictionary never contains them.
- `json_extract` / `json_each.value` return scalar text for a string translation and JSON text for an
  object translation (`richtext`, `json`), which is what `LIKE` / `=` / ORDER BY already see today for
  those types.
- The localized column is table-qualified inside the expression on purpose. With `?search`, the FTS table
  is joined and has columns with the same alias names.

**3c. Use it in `buildSelectQuery`.** In the filter loop, replace

```ts
    const col = SYSTEM_COLUMNS.has(group.column)
      ? `${table}.${group.column}`
      : group.column
```
with
```ts
    const col = columnSql(seed, table, group.column, options.locale)
```
(the encrypted `_bidx` branch below it is untouched; `localized` + encrypted storage is Fatal 17 since Sprint 1).

In the ORDER BY branch, replace

```ts
      const col = SYSTEM_COLUMNS.has(orderBy.column)
        ? `${table}.${orderBy.column}`
        : orderBy.column
```
with
```ts
      const col = columnSql(seed, table, orderBy.column, options.locale)
```

Leave the `fields` projection alone. Rows are still selected raw, and the API resolves them in JS through
the same core chain.

---

#### Task 4 — `packages/core/src/engine/policies.ts`

Add `import { isLocaleDictionary, isLocalizedBranch } from './localization.js'`. Add above `filterEntryForActor`:

```ts
const MASK = '••••••••'

/**
 * The masked form of a value. A localized dictionary (a `?lang=all` read) masks each translation, exactly as
 * a single-language read masks the one translation it resolves to; before this, any object became `null`.
 */
function maskValue(branch: Branch, value: unknown): unknown {
  if (typeof value === 'string') return value.length > 0 ? MASK : null
  if (isLocalizedBranch(branch) && isLocaleDictionary(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([locale, translation]) => [
        locale,
        typeof translation === 'string' && translation.length > 0 ? MASK : null,
      ]),
    )
  }
  return null
}
```

Replace the masked line (L191) with `result[key] = maskValue(branch, value)`. Nothing else in the function
changes.

---

#### Task 5 — `apps/api/src/public/public-language.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.

/**
 * @module public/public-language
 * Response-language negotiation for the Public API: `?lang` → `Accept-Language` → the project default
 * locale, or every language with `?lang=all` / `?lang=*`. Active only when some seed has a localized branch;
 * otherwise nothing here reads settings, changes the cache key or adds a header.
 */

import type { Context } from 'hono'
import { asLocaleDictionaries, isLocaleCode, isLocalizedBranch, resolveLocaleConfig, resolveLocalizedFields } from '@beechcms/core'
import type { ISeedRegistry, ISiteSettingsRepository, LocaleConfig, Seed, SelectLocale } from '@beechcms/core'

export type PublicLanguage =
  | { readonly mode: 'single'; readonly locale: string; readonly config: LocaleConfig }
  | { readonly mode: 'all'; readonly config: LocaleConfig }

export type LanguageNegotiation =
  | { readonly ok: true; readonly language: PublicLanguage }
  | { readonly ok: false; readonly detail: string }

/** Query parameter that carries the resolved language in the edge-cache key. */
export const LANGUAGE_CACHE_PARAM = '__beech_lang'

const ALL_LANGUAGES = new Set(['all', '*'])
/** Bounds parsing work on a hostile header; browsers send a handful of entries. */
const MAX_ACCEPT_LANGUAGE_ENTRIES = 20

/** `EN-us` → `en-US`. Anything that is not `language[-region]` comes back trimmed for isLocaleCode to refuse. */
export function normalizeLanguageTag(raw: string): string {
  const trimmed = raw.trim()
  const parts = trimmed.split('-')
  if (parts.length === 1) return trimmed.toLowerCase()
  if (parts.length === 2) return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`
  return trimmed
}

/** RFC 4647 lookup, v1: the exact code, then its primary language subtag (`en-US` → `en`). */
function lookupLocale(tag: string, config: LocaleConfig): string | null {
  if (config.locales.includes(tag)) return tag
  const primary = tag.split('-')[0]
  return primary !== tag && config.locales.includes(primary) ? primary : null
}

/**
 * Accept-Language tags in preference order: q descending, header order among equals. Drops `*`, `q=0`,
 * malformed q-values and tags outside the locale grammar.
 */
export function parseAcceptLanguage(header: string | undefined): string[] {
  if (!header) return []
  return header
    .split(',')
    .slice(0, MAX_ACCEPT_LANGUAGE_ENTRIES)
    .map((part, index) => {
      const [rawTag, ...params] = part.split(';')
      const qParam = params.map((param) => param.trim()).find((param) => param.startsWith('q='))
      const q = qParam === undefined ? 1 : Number(qParam.slice(2))
      return { tag: normalizeLanguageTag(rawTag), q, index }
    })
    .filter((entry) => isLocaleCode(entry.tag) && Number.isFinite(entry.q) && entry.q > 0 && entry.q <= 1)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map((entry) => entry.tag)
}

/**
 * Picks the response language. A well-formed `?lang` the project does not register falls through to
 * Accept-Language and then the default, so a frontend's stale `.lang()` still renders; a malformed one is
 * refused, since it can only be a client bug.
 */
export function negotiatePublicLanguage(
  input: { readonly lang?: string | null; readonly acceptLanguage?: string | null },
  config: LocaleConfig,
): LanguageNegotiation {
  const requested = input.lang?.trim()
  if (requested) {
    if (ALL_LANGUAGES.has(requested.toLowerCase())) return { ok: true, language: { mode: 'all', config } }
    const tag = normalizeLanguageTag(requested)
    if (!isLocaleCode(tag)) {
      return { ok: false, detail: `'lang' must be a language code such as 'en' or 'pt-BR', or 'all'.` }
    }
    const locale = lookupLocale(tag, config)
    if (locale) return { ok: true, language: { mode: 'single', locale, config } }
  }
  for (const tag of parseAcceptLanguage(input.acceptLanguage ?? undefined)) {
    const locale = lookupLocale(tag, config)
    if (locale) return { ok: true, language: { mode: 'single', locale, config } }
  }
  return { ok: true, language: { mode: 'single', locale: config.defaultLocale, config } }
}

/** True when some seed has a localized branch — the only case where a public read depends on language. */
export function registryUsesLocalization(registry: Pick<ISeedRegistry, 'all'>): boolean {
  return registry.all().some((seed) => seed.branches.some(isLocalizedBranch))
}

/**
 * Negotiates the language of a public read, or `language: undefined` when no seed is localized (the response
 * cannot depend on language: no settings read, same cache key, no header — brief §4). The trigger is
 * registry-wide, not per-seed, because a non-localized seed can `?include` or subquery a localized one.
 * Uncached on purpose, like loadLocaleConfig: a version token would cost the same single D1 read.
 */
export async function loadPublicLanguage(input: {
  readonly registry: Pick<ISeedRegistry, 'all'>
  readonly settings: Pick<ISiteSettingsRepository, 'getAll'>
  readonly lang: string | undefined
  readonly acceptLanguage: string | undefined
}): Promise<{ readonly ok: true; readonly language: PublicLanguage | undefined } | { readonly ok: false; readonly detail: string }> {
  if (!registryUsesLocalization(input.registry)) return { ok: true, language: undefined }
  const config = resolveLocaleConfig(await input.settings.getAll())
  return negotiatePublicLanguage({ lang: input.lang, acceptLanguage: input.acceptLanguage }, config)
}

/** The `SelectOptions.locale` of a read: filters and sort compare in the default locale under `?lang=all`. */
export function selectLocaleOf(language: PublicLanguage | undefined): SelectLocale | undefined {
  if (!language) return undefined
  return { code: language.mode === 'single' ? language.locale : language.config.defaultLocale, config: language.config }
}

/** Resolves every localized field of `data` to the language — flat values, or full dictionaries in `all` mode. */
export function localizePublicEntry(
  seed: Pick<Seed, 'branches'>,
  data: Record<string, unknown>,
  language: PublicLanguage | undefined,
): Record<string, unknown> {
  if (!language) return data
  return language.mode === 'all'
    ? asLocaleDictionaries(seed, data, language.config)
    : resolveLocalizedFields(seed, data, language.config, language.locale)
}

/**
 * Edge-cache key of a read: the URL plus the resolved language. The Workers Cache API keys on the URL and
 * ignores `Vary: Accept-Language`, so two visitors with different headers would otherwise share one entry.
 */
export function languageCacheKey(request: Request, language: PublicLanguage | undefined): Request {
  if (!language) return request
  const url = new URL(request.url)
  url.searchParams.set(LANGUAGE_CACHE_PARAM, language.mode === 'all' ? '*' : language.locale)
  return new Request(url.toString(), { method: 'GET' })
}

/** `Vary` for downstream HTTP caches; `Content-Language` names the language a flat response resolved to. */
export function setLanguageHeaders(context: Context, language: PublicLanguage | undefined): void {
  if (!language) return
  context.header('Vary', 'Accept-Language', { append: true })
  if (language.mode === 'single') context.header('Content-Language', language.locale)
}
```

`SelectLocale` reaches `@beechcms/core` consumers through the existing `export * from './engine/types.js'`
(`packages/core/src/index.ts:L14`). `packages/core/src/index.ts` needs no edit.

---

#### Task 6 — `apps/api/src/public/public-read.ts`

After the `checkPublicOperation` block and **before** `resolveEdgeCache`:

```ts
  const negotiated = await loadPublicLanguage({
    registry: context.get('seedRegistry'),
    settings: context.get('siteSettingsRepository'),
    lang: context.req.query('lang'),
    acceptLanguage: context.req.header('Accept-Language'),
  })
  if (!negotiated.ok) {
    return publicProblem(context, { type: 'invalid-lang', title: 'Bad Request', status: 400, detail: negotiated.detail })
  }
  const language = negotiated.language
```

Replace `const cacheKey = context.req.raw` with `const cacheKey = languageCacheKey(context.req.raw, language)`.
Immediately after the cache-hit block (before `const query = …`), add `setLanguageHeaders(context, language)`.
Pass `language` to `readSingleEntry({ …, language })` and `readListEntries({ …, language })`.
Import `loadPublicLanguage`, `languageCacheKey`, `setLanguageHeaders` from `./public-language`.

---

#### Task 7 — `read-list.ts`, `read-single.ts`, `entry-projection.ts`, `relation-include.ts`, `relation-subquery.ts`

**`entry-projection.ts`**
```ts
import { localizePublicEntry, type PublicLanguage } from './public-language'

export function toFlatPublicEntry(
  data: Record<string, unknown>,
  seed: Seed,
  fieldsParam?: string,
  language?: PublicLanguage,
): Record<string, unknown> {
  // Resolve first: masking and `?fields` then see the value the reader gets, not the stored dictionary.
  const projected = applyPublicPolicies(localizePublicEntry(seed, data, language), seed)
  // … rest unchanged
```

**`relation-include.ts`**: add the trailing parameter `language?: PublicLanguage` after `rawItems`. Change
`targetMap.set(ti.id as string, toFlatPublicEntry(ti, targetSeed))` to
`toFlatPublicEntry(ti, targetSeed, undefined, language)`. The id collection reads `rawItems`, which are never
localized. No other change.

**`relation-subquery.ts`**: add the trailing parameter `locale?: SelectLocale` to `resolveRelationSubqueries`
and to `resolveTargetIds`. Forward it from the first to the second. In `resolveTargetIds`'s `findMany` options,
add `...(locale ? { locale } : {})`. Import `type SelectLocale` from `@beechcms/core`.

**`read-list.ts`**: `ReadListInput` gains `language?: PublicLanguage`. Then:
```ts
  const locale = selectLocaleOf(language)
  const resolved = await resolveRelationSubqueries(parsedFilter, seed, repository, getSeed, publishedOnly, locale)
  …
  const { items, total } = await repository.findMany(seed, {
    …existing keys…,
    ...(locale ? { locale } : {}),
  })
  const data = items.map(item => toFlatPublicEntry(item, seed, query.fields, language))
  await expandRelations(data, query.include, seed, repository, getSeed, items, language)
```
The conditional spread keeps the options object key-for-key identical when there is no language. Existing
`toHaveBeenCalledWith` unit assertions stay valid either way, but this is the explicit contract.

**`read-single.ts`**: `ReadSingleInput` gains `language?: PublicLanguage`. Then
`toFlatPublicEntry(entry, seed, fieldsParam, language)` and
`expandRelations([data], query.include, seed, repository, getSeed, [entry], language)`.

---

#### Task 8 — `apps/api/src/public/public-add.ts`

Right after `const localeConfig = await loadLocaleConfig(...)` (L315), before `sanitizePublicPayload`:

```ts
  const negotiated = localeConfig
    ? negotiatePublicLanguage({ lang: context.req.query('lang'), acceptLanguage: context.req.header('Accept-Language') }, localeConfig)
    : undefined
  if (negotiated && !negotiated.ok) {
    return publicProblem(context, { type: 'invalid-lang', title: 'Bad Request', status: 400, detail: negotiated.detail })
  }
  const language = negotiated?.ok ? negotiated.language : undefined
```

Replace `data: { id, slug: finalSlug, status: statusValue, ...sanitized.data }` in `responseBody` with
`data: localizePublicEntry(seed, echoed, language)`, where `echoed` is built just above `responseBody`:

```ts
    // Localized fields echo their stored (merged, compacted) value, not the raw write.
    const echoed: Record<string, unknown> = { id, slug: finalSlug, status: statusValue, ...sanitized.data }
    for (const alias of localizedAliasesIn(seed, sanitized.data)) echoed[alias] = privacyData[alias]
```

`localizedAliasesIn` comes from `@beechcms/core`. The automation runner payload and the notification /
activity-log code are **unchanged**.

#### Task 9 — `apps/api/src/public/public-edit.ts`

Right after `const localeConfig = await loadLocaleConfig(...)` (L205), add the same four-statement
negotiation block as Task 8. Replace the response `data: { ...updatedEntry, status: statusResult.value }` with
`data: localizePublicEntry(seed, { ...updatedEntry, status: statusResult.value }, language)`. Nothing else
changes; see VETO §6 for what is deliberately left alone.

---

#### Task 10 — `packages/client/src/types.ts`

In `ListQuery<TRow>`, after `latest?: number`:
```ts
  /** Response language (`?lang`). The API falls back to Accept-Language, then the project default. */
  lang?: string
```
In `FluentQuery<TRow>`, after `page(number: number): this`:
```ts
  /**
   * Requests one language: localized fields come back as plain values in that language, and filters and
   * sort compare in it. An unregistered code falls back to the project default; a malformed one is a 400.
   */
  lang(code: string): this
```

#### Task 11 — `packages/client/src/query-builder.ts`

```ts
  lang(code: string): this {
    this.query.lang = code
    return this
  }
```
(after `page()`), and in `buildSearchParams`, after the `limit` line:
```ts
  if (query.lang) params.set('lang', query.lang)
```

---

#### Task 12 — Tests (follow `_config/testing_conventions.md`; MIT header in `packages/*`, three-line BUSL in `apps/api`)

**T1 — `localization.test.ts` (extend, unit).**
- In `describe('resolveLocalizedValue')`, change the row `[{ de: 'Schuh' }, 'en', null]` to
  `[{ de: 'Schuh' }, 'en', 'Schuh']`, add `[{ en: '', de: 'Schuh' }, 'it', 'Schuh']`, and rename the `it()`
  to `'resolves the requested locale, then the default, then the first stored translation, and passes a
  legacy value through'`. Put this comment above the changed row: `// Contract change (decision (c)): a
  dictionary missing both locales renders its first stored translation instead of blanking.`
  State the change in the PR (Rule 7.10).
- New `describe('asLocaleDictionary')`, one matrix `it()`
  (`'returns stored dictionaries as-is, wraps a legacy value under the default locale and maps blank to null'`):
  `{ it:'Scarpa', de:'Schuh' }` → same object (orphan kept); `'Legacy'` → `{ it: 'Legacy' }`; `''` → `null`;
  `null` → `null`. Add a json row with `JSON_BRANCH`: `{ url: 'x' }` → `{ it: { url: 'x' } }`, because it has
  no registered key. Non-localized `{ type: 'text' }` with `{ it: 'x' }` → unchanged.
- New `describe('asLocaleDictionaries')`: `'expands localized fields and leaves others untouched'`.

**T2 — `query.test.ts` (extend, unit).** New top-level `describe('buildSelectQuery — localized columns')`
with its own fixture seed `loc_articles` (`title`: text localized; `data`: json localized; `code`: text).
Use `const LOCALE: SelectLocale = { code: 'en', config: { locales: ['it', 'en'], defaultLocale: 'it' } }`.
  a. `'a filter on a localized text branch compares the value resolved in the requested locale'`: filter
     `title eq 'Shoe'`. The SQL contains `json_extract(content_loc_articles.title, '$."en"')` and
     `json_extract(content_loc_articles.title, '$."it"')`. Bindings `toEqual(['Shoe'])`, so the expression
     adds no binding.
  b. `'ORDER BY a localized branch sorts on the resolved value'`: `orderBy title ASC`. The SQL contains
     `ORDER BY (CASE WHEN json_valid(content_loc_articles.title)` and ends the ORDER BY with ` ASC`.
  c. `'without a locale a localized branch is compared raw, exactly as before'`: same filter, no `locale`.
     `sql` contains `WHERE title = ?` and not `json_extract`. Comment it as a regression guard: the
     non-localized path must stay byte-identical.
  d. `'a non-localized branch is compared raw even when a locale is set'`: filter `code eq 'X1'` with
     `LOCALE`. The SQL contains `WHERE code = ?`.
  e. `'a localized json branch also requires a registered locale key before treating a value as a
     dictionary'`: filter on `data`. The SQL contains `key IN ('it', 'en')`, and the `title` filter SQL
     from (a) does not.
  f. `'a locale code outside the grammar throws before any SQL is built'`: matrix over `code` values
     `"en'); DROP TABLE x;--"`, `'EN'`, `'en_US'`: `expect(() => buildSelectQuery(...)).toThrow(TypeError)`.
     Comment it as a regression guard: codes are inlined, so the grammar is the injection guard.

**T3 — `policies.test.ts` (extend, unit).** `describe('filterEntryForActor')` (create it if the file uses
another name for the block; nest under it):
  - `'masks each translation of a masked localized dictionary'`: branch
    `{ type: 'text', localized: true, policies: { visibility: 'masked' } }`, value `{ it: 'Scarpa', en: '' }`
    → `{ it: '••••••••', en: null }`.
  - `'still masks a non-localized object value to null'`: masked `json` branch, `{ a: 1 }` → `null`.
    Comment it as a regression guard for the unchanged path.

**T4 — `apps/api/src/public/public-language.test.ts` (new, unit, next to source).**
Fixture: `CONFIG: LocaleConfig = { locales: ['it', 'en', 'pt-BR'], defaultLocale: 'it' }`.
- `describe('negotiatePublicLanguage')`
  - `'negotiates ?lang, then Accept-Language, then the default locale'`: a matrix of
    `[lang, acceptLanguage, expectedLocale | 'all']`:
    `['en', undefined, 'en']`, `['EN', undefined, 'en']`, `['en-US', undefined, 'en']`,
    `['pt-br', undefined, 'pt-BR']`, `['fr', 'en', 'en']`, `['fr', undefined, 'it']`,
    `['all', 'en', 'all']`, `['*', undefined, 'all']`, `[undefined, 'fr-CH, en;q=0.8', 'en']`,
    `[undefined, 'en;q=0.1, pt-BR;q=0.5, de;q=0', 'pt-BR']`, `[undefined, 'en;q=0', 'it']`,
    `[undefined, '*', 'it']`, `['', 'en', 'en']`, `[undefined, undefined, 'it']`.
  - `'refuses a malformed ?lang instead of falling back'`: `['en_US', 'e', 'english', "en'--", 'en-US-x']`,
    each `→ { ok: false }`. Assert `result.ok` is `false`, not the detail text (Rule 5.4).
- `describe('parseAcceptLanguage')`
  - `'orders tags by q-value, keeps header order among equals and drops wildcards, q=0 and malformed tags'`:
    `'de;q=0.5, en, it;q=0.5, *;q=0.9, xx_YY, fr;q=0, es;q=abc'` → `['en', 'de', 'it']`.
- `describe('loadPublicLanguage')`
  - `'returns no language and reads no settings when no seed is localized'`: registry of one non-localized
    seed; `getAll = vi.fn<ISiteSettingsRepository['getAll']>()`; result `{ ok: true, language: undefined }`,
    `getAll` not called. Comment it as a regression guard: a mono-lingual project must pay no extra D1 read
    per public request.
  - `'resolves the stored configuration when any seed is localized, even if not the requested one'`:
    registry `[nonLocalized, localized]`, `getAll` resolving to `SiteSettings` with
    `locales: ['it','en'], defaultLocale: 'it'`, `lang: 'en'` → `language` `toEqual({ mode: 'single',
    locale: 'en', config: { locales: ['it','en'], defaultLocale: 'it' } })`. Reuse the `SiteSettings`
    literal shape from `shared/localization/locale-config.test.ts` by copying it, not importing it (Rule 1.1).
- `describe('languageCacheKey')`
  - `'adds the resolved language to the cache key and keeps every other query parameter'`:
    `new Request('https://api.test/api/v1/public/products?limit=5')` with `en` → key URL
    `searchParams.get('__beech_lang') === 'en'` and `limit === '5'`. With `all` mode, `'*'`.
  - `'returns the request itself when the response is language-independent'`:
    `languageCacheKey(request, undefined)` `toBe(request)`.

**T5 — `entry-projection.test.ts` (extend, unit).** Add a localized masked branch to a local seed in the new
test (do not change the file-level `SEED`):
  - `'resolves a localized field before masking, so a masked translation shows the mask instead of null'`:
    `toFlatPublicEntry({ id, tagline: { it: 'Ciao', en: 'Hi' } }, seed, undefined, { mode: 'single',
    locale: 'en', config })` → `tagline === '••••••••'`. Comment it as a regression guard: a masked field
    that held a dictionary became null.
  - `'resolves localized fields to the requested language'`: unmasked `title` `{ it:'Scarpa', en:'Shoe' }`
    → `'Shoe'`.

**T6 — `packages/client/src/query-builder.test.ts` (extend, unit).**
  - `'lang() sends the language as the lang parameter'`: `new FluentQueryBuilder(executor).lang('en').build()
    .get('lang') === 'en'`.
  - `'omits lang when no language was requested'`: `buildSearchParams({}).has('lang') === false`.

**T7 — `apps/api/src/public/test/integration/public-localization-read.integration.test.ts` (new, integration).**
File docblock (Rule 6.4): *"Public slice — localized reads, integration tier. Covers language negotiation,
flat and all-language payloads, and filters / sort / include / subquery through the negotiated language
against real D1. The edge-cache key is unit-tested in public-language.test.ts (no executionCtx here)."*

Seeds (inline `defineSeed`, as Sprint 2 T12 does; no canonical seed carries `localized`):
```ts
const colorsSeed = defineSeed({
  slug: 'loc_colors', label: 'Colors', displayNameAlias: 'name', allowPublicRead: true,
  branches: [{ id: 'br_01', alias: 'name', label: 'Name', type: 'text', localized: true, policies: { public: true } }],
})
const productsSeed = defineSeed({
  slug: 'loc_products', label: 'Products', displayNameAlias: 'title', allowPublicRead: true,
  branches: [
    { id: 'br_01', alias: 'title', label: 'Title', type: 'text', localized: true, requiredOnCreate: true, policies: { public: true } },
    { id: 'br_02', alias: 'subtitle', label: 'Subtitle', type: 'text', localized: true, policies: { public: true } },
    { id: 'br_03', alias: 'tagline', label: 'Tagline', type: 'text', localized: true, policies: { public: true, visibility: 'masked' } },
    { id: 'br_04', alias: 'color_id', label: 'Color', type: 'relation', targetSeed: 'loc_colors', policies: { public: true } },
  ],
})
```
`describe('public slice — localized reads (real D1)')`. `beforeEach`: `__resetSeedRegistryCache()`, harness
with `seeds: [colorsSeed, productsSeed]`, `admin`, `publicClient = harness.anonymous().withHeaders({ 'X-API-Key':
TEST_PUBLIC_READ_KEY })`, `DELETE FROM site_settings` (with the Sprint 2 comment), then
`PUT /api/settings { locales: ['it','en'], defaultLocale: 'it' }` (throw if not 200). Declare a local helper
`createProduct(data)` = `admin.post('/api/content/loc_products', { ...data, status: 'published' })`, which
asserts 201 and returns the id (Rule 3.12). Typed bodies throughout; no `any`.

`describe('GET /api/v1/public/:seed')`:
  1. `'?lang returns localized fields as flat values in that language and names it in Content-Language'`:
     product `{ title: { it:'Scarpa', en:'Shoe' } }`; GET `?id=<id>&lang=en` → 200, `data.title === 'Shoe'`,
     `Content-Language === 'en'`, `Vary` contains `Accept-Language`.
  2. `'Accept-Language picks the language when ?lang is absent, matching a regional tag to its language'`:
     header `Accept-Language: en-US,it;q=0.5` → `data.title === 'Shoe'`, `Content-Language === 'en'`.
  3. `'a missing translation falls back to the default locale'`: `{ title: { it: 'Scarpa' } }`, `?lang=en`
     → `'Scarpa'`.
  4. `'?lang=all returns every translation as a dictionary and no Content-Language'`: → `data.title`
     `toEqual({ it:'Scarpa', en:'Shoe' })`, `Content-Language` header `null`.
  5. `'an unregistered ?lang falls back to the default locale'`: `?lang=fr` → 200, `'Scarpa'`,
     `Content-Language === 'it'`.
  6. `'a malformed ?lang is refused with 400 invalid-lang'`: `?lang=en_US` → 400,
     `type === 'https://beechcms.dev/problems/invalid-lang'`.
  7. `'filters on a localized field compare against the negotiated language'`: product
     `{ title: { it:'Scarpa', en:'Shoe' } }`. A matrix over `[['en', 1], ['it', 0]]` with filter
     `{"where":[{"field":"title","op":"eq","value":"Shoe"}]}`, asserting `meta.total`. This is the Rule 1.6
     case: one arrangement, one cause.
  8. `'sorting on a localized field orders by the negotiated language'`: products
     `{ it:'Arancia', en:'Orange' }` and `{ it:'Mela', en:'Apple' }`; `?lang=en&orderBy=title&orderDir=asc` →
     titles `['Apple', 'Orange']`. Comment it as a regression guard: raw JSON text sorts by the Italian value
     first (`{"it":"Arancia"…` < `{"it":"Mela"…`), giving the opposite order.
  9. `'a dictionary missing both the requested and default locale resolves to its first translation, in
     filters too'`: product `{ title: { it:'Scarpa' }, subtitle: { en:'Walking shoe' } }`;
     `?lang=it&filter=subtitle eq 'Walking shoe'` → `meta.total === 1`,
     `data[0].subtitle === 'Walking shoe'`.
  10. `'a masked localized field shows the mask for the resolved translation'`: `tagline: { it:'Ciao', en:'Hi' }`,
      `?id&lang=en` → `data.tagline === '••••••••'`.
  11. `'?include resolves the related entry in the same language'`: color `{ name: { it:'Rosso', en:'Red' },
      status:'published' }`; product with `color_id`; `?id=<p>&include=color_id&lang=en` →
      `data._includes.color_id.name === 'Red'`.
  12. `'a relation subquery filters the target through the negotiated language'`: same arrangement as 11;
      filter `{"where":[{"field":"color_id","op":"in","value":{"where":[{"field":"name","op":"eq","value":"Red"}]}}]}`
      with `lang=en` → `meta.total === 1` and `data[0].id === productId`.
  13. `'a value written before the field was localized is returned and filtered as-is'`: arrange through
      routes only (Rule 3.8). `POST /api/seeds` for `loc_legacy` (`allowPublicRead: true`, `displayNameAlias:
      'title'`, a non-localized `title` text branch with `policies: { public: true }`), then `POST
      /api/content/loc_legacy { title: 'Legacy', slug: 'legacy', status: 'published' }`, then
      `PUT /api/seeds/loc_legacy` with the branch set `localized: true` (the Sprint 1
      `seed-localization.integration.test.ts` L112-128 pattern). Assert the preconditions in one line each.
      ACT: `GET /api/v1/public/loc_legacy?lang=en&filter=title eq 'Legacy'` → `meta.total === 1`,
      `data[0].title === 'Legacy'`.

Second `describe('public slice — reads of a project without localized fields (real D1)')`, with its own
`beforeEach`: a harness with the canonical seeds only, no `seeds:` override, and no settings change.
  14. `'ignores ?lang and adds no language headers when no field is localized'`:
      `GET /api/v1/public/posts?lang=en_US` → **200** (not 400), `Vary` header null or without
      `Accept-Language`, `Content-Language` null. Comment it as a regression guard: a mono-lingual project
      must observe no difference (brief §4). Before writing it, confirm that the canonical `posts` seed has
      `allowPublicRead: true`. If it does not, use the canonical seed that does. If none does, define one
      non-localized public seed inline and say so in a comment.

Reads write nothing, so zone 4 does not apply (Rule 5.5 covers writes).

**T8 — `public-localization-write.integration.test.ts` (extend, integration).**
  - `'POST /api/v1/public/:seed/add answers with the stored value in the negotiated language'`: header
    `Accept-Language: en`, body `{ title: { it:'Scarpa', en:'Shoe' } }` → 201, `data.title === 'Shoe'`. Zone 4:
    `SELECT title FROM content_public_loc WHERE id = ?` parses to `{ it:'Scarpa', en:'Shoe' }`.
  - `'POST /api/v1/public/:seed/add refuses a malformed ?lang and writes nothing'`: `POST …/add?lang=en_US`
    with `{ title: 'Scarpa' }` → 400 `invalid-lang`. Zone 4: `SELECT COUNT(*) AS n FROM content_public_loc`
    is still `0` (Rule 5.6).
  - `'PUT /api/v1/public/:seed/edit/:id answers with the merged value in the negotiated language'`: entry
    `{ title: { it:'Scarpa' } }`; `PUT …/edit/:id?lang=en` with `{ title: { en:'Shoe' } }` → 200,
    `data.title === 'Shoe'`. Zone 4: the row parses to `{ it:'Scarpa', en:'Shoe' }`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repository root unless noted. Every command must exit 0.

```bash
# 1. Core: build and unit tests (T1–T3)
pnpm --filter @beechcms/core build
pnpm --filter @beechcms/core test

# 2. SDK: type-check, build and unit tests (T6)
pnpm --filter @beechcms/client type-check
pnpm --filter @beechcms/client build
pnpm --filter @beechcms/client test

# 3. API: type-check (from apps/api/)
npx tsc -p tsconfig.build.json --noEmit

# 4. API unit tier (T4, T5 + every pre-existing public-* unit suite)
pnpm --filter @beechcms/api test:unit

# 5. API integration tier, workerd + real D1 (T7, T8 + every pre-existing public-* integration suite)
pnpm --filter @beechcms/api test:integration

# 6. Dashboard still type-checks against the widened core types
pnpm --filter @beechcms/dashboard type-check

# 7. Workspace
pnpm beech test --diff
pnpm lint

# 8. Graph
graphify update . --force
```

No `pnpm beech db:migrate` / `db:reset`: this sprint ships no migration.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `localization.ts`: `resolveLocalizedValue` follows requested → default → first stored translation → `null`,
      and returns a legacy value as-is. `asLocaleDictionary` / `asLocaleDictionaries` are exported, pure, and
      import only `./types.js` and `./validation/primitives.js`. The `@beechcms/core` `package.json`
      dependencies are unchanged.
- [ ] `SelectOptions.locale?: SelectLocale` exists. With it absent, `buildSelectQuery` output is identical to
      pre-sprint for every input (T2c).
- [ ] With `locale` set, WHERE and ORDER BY on a localized branch use the self-contained expression. It adds
      no bindings, qualifies the column with the table, and inlines only `isLocaleCode`-checked codes. A
      malformed code throws `TypeError` (T2f).
- [ ] A filter / sort result on a localized field agrees with the flat value in the response, including the
      default-locale fallback, the first-translation fallback and legacy values (T7-7, -8, -9, -13).
- [ ] Public reads negotiate `?lang` → `Accept-Language` (exact, then primary subtag) → `defaultLocale`.
      `?lang=all|*` returns dictionaries. A well-formed unregistered code falls through. A malformed one is
      `400 invalid-lang`.
- [ ] Language-dependent reads send `Vary: Accept-Language` (appended, never replacing `Origin`) and,
      in single mode, `Content-Language`. The edge-cache key carries `__beech_lang=<code|*>`.
- [ ] `?include` targets and relation-subquery targets are resolved / filtered in the same language.
- [ ] A masked localized field shows the mask for the resolved translation (single mode) or per translation
      (`all` mode). It is never `null` because the stored value was an object.
- [ ] `public-add` / `public-edit` negotiate before writing (malformed `?lang` → 400, nothing written) and answer
      with localized fields in the negotiated language.
- [ ] A project with no localized branch performs **no** `site_settings` read on public reads (T4) and sends
      no language header, and its public responses and cache keys are unchanged (T7-14). Every pre-existing
      test passes unmodified. The only exception is the one `resolveLocalizedValue` matrix row, which changes
      deliberately (T1).
- [ ] `@beechcms/client`: `.lang(code)` exists on `FluentQuery`, and `buildSearchParams` emits `lang` only when set.
- [ ] Zero changes under `apps/api/src/{factory.ts,types.ts,middleware}`, `apps/api/migrations`,
      `apps/api/src/features/**`, `apps/api/src/shared/**`, `packages/core/src/engine/{serialize,ddl,seed-*,schema-fingerprint}.ts`,
      `packages/core/src/search/**`, `apps/dashboard`, `packages/{api-client,mcp,cli,testing}`.
- [ ] Every SECTION 5 command passes, and every new or changed test file conforms to
      `_config/testing_conventions.md` §8.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify:

- **Dashboard anything.** This covers language management UI, the "Localizzato" toggle, and rendering
  localized values in tables, cards, the palette or drafts. See ROADMAP §4 `LocalizationDashboardSchema`.
- **Authenticated reads** (`/api/content/*` list/get, export stream, drafts, MCP). They keep returning raw
  dictionaries and comparing raw in filters. Passing `SelectOptions.locale` from the authenticated list is
  recorded as a ROADMAP §4 item. The only authenticated-path effect of this sprint is the masked-dictionary
  rule in core `filterEntryForActor` (VETO / verdict above).
- **Entry Editor** locale selector, fallback indicator, completion badge: ROADMAP §5 `LocalizedEntryEditor`.
- **Any cache for `LocaleConfig`**, isolate-level or version-token (VETO §4).
- **FTS changes**: no reindex, no tokenizer change, no per-language FTS tables. Locale keys being tokens
  is a known limit.
- **`GET /:seed/schema`** changes (`localized` flags, project locales).
- **SDK typing for `?lang=all`**: `TRow` stays single-language. No change to `browser/client.ts` /
  `server/client.ts`, `create` / `update`, or schema-fingerprint handling.
- **Documentation site / SDK reference pages** for `?lang` and `.lang()`. They are documented once, for the
  whole feature, after Sprint 5 (ROADMAP note).
- **Write paths**: `create_entry` automation dictionary detection (Sprint 2 review finding 2 → ROADMAP
  fast-follow), bulk / `edit_field` per-locale merge, draft OCC. All are unchanged.
- **The `public-edit` response echoing non-public fields** (VETO §6): a separate security bugfix, not part of
  this feature. Do not "fix it while there".
- **Scope-creep refactors**: no consolidation of the duplicated `ifMatch` guard, no parallelising of the
  `loadLocaleConfig` / `findById` reads, no rename of `toFlatPublicEntry`.
