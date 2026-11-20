# Sprint Plan — BeechPalContentSearch (BeechPal, sprint 4 of 10)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 4).
Feature brief: `stages/00_ideation/output/feature_brief.md`.
Previous sprints (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/`,
`docs/Sprints/BeechPalLocalTools/`, `docs/Sprints/SearchResultMetadataApi/`.

Scope note: the roadmap's entry 4 also listed "row secondary actions + keyboard submenu (copy ID
first)". That is a separate engine capability (a per-row action contract, an actions page, two new
keyboard bindings) with nothing in common with the async lane except the palette file. It is moved
to the new roadmap entry **4b `BeechPalRowActions`** so each part is validated on its own. Entry 9
(pins) now depends on 4b for the submenu.

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30119 nodes, 44033 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L95` | Engine entry. Gains the async lane, the content search provider, the "searching" empty state. Loses the `search-results` branch. Public props unchanged. |
| `CommandPage` | `features/command-palette/types.ts:L10` | Loses the `search-results` member. Degree 9; every consumer outside the slice uses only `root`/`settings`/`edit-schema`. |
| `collectPaletteItems()` | `features/command-palette/lib/collect-palette-items.ts:L19` | Its page/prefix rule is extracted into `servesContext` so the async lane routes the same way. Signature unchanged. |
| `PaletteList()` / `PaletteRow` | `features/command-palette/_parts/palette-list.tsx:L55`, `L27` | Renders an optional `StatusBadge` on the second line. |
| `SearchResultsView()` | `features/command-palette/_parts/search-results-view.tsx:L35` | Deleted together with its test. |
| `SearchResultItem` | `apps/api/src/features/search/types.ts:L20` | Consumed read-only through `rpc` (`AppType`). Carries `updated_at` and `author_name` since sprint 3. |
| `usePermissions()` | `features/shared/hooks/use-permissions.ts` | Consumed, unchanged: gates the search request on `content:read` anywhere. |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. `GET /api/search` already returns `status`, `updated_at`, `author_name` and
  projects RBAC per seed (`handlers/full-text-search.ts:L75–L91`). The dashboard reads it through
  the typed `rpc` client; nothing in the API changes.
- `apps/dashboard`:
  - `src/features/command-palette/` (owner slice): async provider contract, `useAsyncPaletteItems`
    hook, content search provider, `/` prefix, engine wiring, status badge on rows, removal of the
    `search-results` sub-page and the `tools:search` row.
  - `src/locales/en.json`, `src/locales/it.json`: one key added, four removed.
  - Shared, read-only imports: `@/lib/rpc`, `@/hooks/use-debounce`, `@/components/ui/status`,
    `@/components/ui/status-badge`, `date-fns`. None is a feature slice.
  - `src/pages/*` (composition root) and `App.tsx`: unchanged.

**c) `graphify affected` impact analysis**

```
graphify affected "CommandPalette()" --depth 2
- App.tsx, index.ts, app-command-palette.tsx, command-palette.test.tsx, app.test.tsx, main.tsx,
  palette-providers.ts, palette-providers.test.ts

graphify affected "SearchResultsView()" --depth 2
- command-palette.tsx [imports]; search-results-view.test.tsx [imports]; index.ts [re_exports]

graphify affected "createToolsProvider()" --depth 2
- command-palette.tsx [imports]; index.ts [re_exports]          (slice-internal only)

graphify affected "PaletteList()" --depth 2
- command-palette.tsx [imports]; index.ts [re_exports]          (slice-internal only)

graphify affected "CommandPage" --depth 2
- command-palette.tsx, index.ts, parse-palette-query.ts, use-command-palette.ts,
  collect-palette-items.test.ts, content-provider.test.ts, command-palette.test.tsx,
  parse-palette-query.test.ts, palette-providers.ts, palette-providers.test.ts, App.tsx,
  app-command-palette.tsx

graphify affected "SearchResultItem" --depth 2
- apps/api only: search index.ts, search-utils.ts(+test), full-text-search.ts(+test), factory.ts,
  index.ts, public-routes.ts, routes.ts
```

Breaking-change verdict:
- Removing `"search-results"` from `CommandPage` is safe. A grep of `apps/dashboard/src` for
  `search-results` finds it only in `command-palette.tsx:L111`/`L207`, `tools-provider.ts:L29` and
  `types.ts:L16`, all edited here. `palette-providers.ts` and the test files use other members.
  `use-command-palette.ts` only types `pages` with it.
- `SearchResultsView` has no consumer outside the slice. The barrel does not export it.
- Adding `"/"` to `PalettePrefix` forces the matching key in `PALETTE_PREFIXES`
  (`lib/parse-palette-query.ts:L8`, `Record` typing). No exhaustive switch over `PalettePrefix`
  exists elsewhere.
- `PaletteItem.status` is optional, so every existing provider and test literal compiles unchanged.
- `app.test.tsx` mocks `@/pages/app-command-palette` (`test/cross-slice/app.test.tsx:L44`), so the
  new `useQueries` call never runs there.
- `command-palette.test.tsx` renders `CommandPalette` with no `QueryClientProvider` (L69 onwards).
  It works today only because `useSchema` is mocked. The new `useQueries` call needs a client, so
  this test's render calls get a wrapper (Task 9). That edit is mechanical; no existing assertion
  changes.
- `SearchResultItem` is not modified; this sprint only reads it.

Findings that shape the plan:
1. The `hc` client accepts a second argument `{ init?: RequestInit }`
   (`node_modules/hono/dist/types/client/types.d.ts:L34`, hono 4.13.13). `apiFetch` already merges
   the caller's `init.signal` with its 30 s budget (`lib/http/api-fetch.ts:L38–L42`, `L68`). An
   `AbortSignal` therefore reaches `fetch` with no change to the HTTP layer.
2. TanStack Query v5 aborts the `signal` it passes to `queryFn` when the query loses its last
   observer while fetching, provided `queryFn` read `signal`. If the query key carries the typed
   text, every keystroke moves the observer to a new key. The previous request is then aborted with
   no hand-written `AbortController`.
3. `GET /api/search` answers 400 below 2 trimmed characters (`SEARCH_LIMITS.QUERY_MIN_LENGTH`,
   `handlers/full-text-search.ts:L71`). The dashboard cannot import the API's constants (only
   `AppType` crosses), so the provider declares `minQueryLength: 2` with a pointer comment.
4. FTS matches body text the title does not contain. cmdk's lexical score on the label would drop
   such hits (`rank-palette-items.ts:L28`). Search rows therefore bypass lexical ranking: they keep
   the server's rank order and are appended after the ranked local rows. This also satisfies
   roadmap entry 4 ("search rows append when they arrive") and avoids moving the selection when
   they land.
5. Design rule 3 (`_config/design_system.html#rules`): a content status is shown only with
   `<StatusBadge>`. "Status in the row description" (brief rule 8) is therefore a badge on the row's
   second line, followed by the text `author · date`. A status string in plain text would be a
   design-lint finding.
6. Relative dates: the dashboard idiom is `formatDistanceToNow(new Date(ts * 1000), { addSuffix:
   true, locale })`, with a per-file `DATE_FNS_LOCALE` record
   (`features/dashboard/components/widgets/recent-content-widget.tsx:L22`, `L67`).

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** The async contract is the smallest one that serves the brief's search stories
  and the brief's explicit instruction to leave the provider interface ready for a later semantic
  provider (§5, "lasciando predisposta l'interfaccia dei provider"). It holds one function and one
  length threshold. Cut as speculative: no pagination or "more results" row, no excerpt rendering,
  no `schema_slug`/`status` filters, no client-side re-ranking, no loading skeleton, no retry, no
  cross-lane dedup (ids are namespaced), no export of the async type from the barrel (no host needs
  it yet). **No VETO.**
- **Rule 2, Botanical invariant.** The palette reads the existing `GET /api/search` contract only.
  No D1 access and no field names: the title, status, `updated_at` and `author_name` are
  system-projected values resolved server-side through `@beechcms/core` (sprint 3). **Respected.**
- **Rule 3, VSA.** All new code lives in `features/command-palette/`. It imports `@/lib/rpc`,
  `@/hooks/use-debounce`, `@/components/ui/*`, `@/lib/icon-registry`, `@tanstack/react-query`,
  `date-fns`, and from features only `@/features/shared`. Zero new cross-feature imports; the
  composition root is untouched. **Respected.**
- **Rule 4, Cloudflare purity.** One debounced `GET` per settled query, cancelled on the next
  keystroke, cached 30 s. No embedding call, no Worker call per keystroke. The server stays the RBAC
  enforcement point. **Respected.**
- **Rule 5, minimal blueprint.** Tier footprint: core 0, api 0. Dashboard: 1 slice, 2 new source
  files, 6 edited, 1 deleted; 2 new test files, 2 edited, 1 deleted; 2 locale files. **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprints 1–2 made the palette a synchronous provider aggregator with prefix routing and per-item
scores. Sprint 3 made each search hit carry what a row must show (status, author, date). Content
search is the last root-list source still living on a separate sub-page (`search-results`). It is
also the only source that is remote and slow. Brief rule 10 says local rows must never wait, and
§4 "Ricerca" says search must not block typing, must be cancelled by the next keystroke and must
fail silently. Those rules need an async lane next to the synchronous one. That lane is the
foundation the semantic provider (brief §5) will plug into later.

The sprint therefore delivers, in order: the async provider contract, one hook that runs async
providers with debounce, cancellation, caching and failure isolation, the content search provider
on that contract, and the removal of the sub-page.

VSA: the hook, the provider and the contract live in the palette slice, and the slice talks to the
search slice only through the typed HTTP client (`rpc`), never by import. Botanical invariant:
nothing reads D1. The rows come from the API, which resolves them through `@beechcms/core`
repositories (`ISearchRepository`, `IActivityLogRepository`).

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Engine** (`command-palette.tsx`). `CommandPalette({ hostProviders })` (L95) memoises the
synchronous providers in this order: calculator, conversions, navigation, content, host, tools
(L119–L129). It parses the input once (`parsePaletteQuery`, L131) and computes `items =
rankPaletteItems(collectPaletteItems(providers, { page, query: parsed.text, prefix: parsed.prefix,
permissions }, describeMissing), parsed.text)` (L132–L141). `perform` (L154) handles `navigate`,
`page`, `run` and `copy`. cmdk runs with `shouldFilter={false}` (L194). `EmptyMessage` (L49) renders
`commandPalette.noResults` inside `CommandEmpty`. On page `search-results` the list is
`SearchResultsView` (L207–L208); otherwise it is `PaletteList` with `ranked={search.trim().length > 0}`
(L210).

**Sub-page search** (`_parts/search-results-view.tsx`). It is reached through the `tools:search`
row (`providers/tools-provider.ts:L23–L31`, shown when `canAnywhere("content:read")`). It
debounces 300 ms (`useDebounce`), calls `rpc.api.search.$get({ query: { q, limit: "8" } })` (L45)
through `useQuery` with `staleTime: 30_000`, and is enabled at 2+ characters. It renders the title,
the excerpt with `<mark>` and `schema_slug · status` as plain text. Selecting a hit navigates to
`/content/<schema_slug>/<id>` and closes. The request is never aborted.

**Contract** (`types.ts`). `CommandPage` (L10, includes `search-results` at L16), `PalettePrefix =
"="` (L41), `PalettePerform` (L44), `PaletteItem` (L50, optional `score` at L66),
`PaletteQueryContext` (L70), `PaletteProvider` (L79, synchronous `getItems`),
`ResolvedPaletteItem` (L92).

**Routing** (`lib/collect-palette-items.ts:L28–L29`). A provider contributes when
`pages.includes(context.page)` and, if `context.prefix` is set, `provider.prefix ===
context.prefix`. `lib/parse-palette-query.ts:L8` holds `PALETTE_PREFIXES = { "=": true }`.

**Row rendering** (`_parts/palette-list.tsx`). `PaletteRow` (L27) shows the icon, the label and a
second line `disabledReason ?? description` (L29, L40). In ranked mode it shows the section on the
right (L42).

**Entry route.** `/content/:slug/:id` (`App.tsx:L264`) opens the entry in `ContentListPage`.

**Data plumbing.** The query client lives in `main.tsx:L34`, with defaults `staleTime: 5 min,
retry: 1` (`lib/query-client.ts:L7`). The persistence allow-list (`lib/query-cache-persistence.ts`)
does not include palette keys. `useDebounce(value, ms)` is in `hooks/use-debounce.ts:L7`.

**Tests today.** `test/unit/command-palette.test.tsx` (jsdom, real i18n English strings, mocks for
`sonner`, `react-router-dom`, `@/features/shared` and `@/lib/theme` at L17–L39, no
`QueryClientProvider`). `test/unit/search-results-view.test.tsx` mocks `@/lib/rpc` and
`@/hooks/use-debounce` (identity) at L14–L16; that is the precedent for both mocks.
`content-provider.test.ts:L17–L27` holds the local `permissionsFor` helper and the stub `t`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create (under `apps/dashboard/src/features/command-palette/`):
1. `use-async-palette-items.ts`: runs async providers (debounce, cancel, cache, isolate).
2. `providers/content-search-provider.ts`: search hits as palette rows.
3. `test/unit/use-async-palette-items.test.tsx`
4. `test/unit/content-search-provider.test.ts`

Edit:
5. `types.ts`: `"/"` prefix, `PaletteItem.status`, `PaletteAsyncProvider`, `CommandPage` without
   `search-results`.
6. `lib/parse-palette-query.ts`: `"/"` in `PALETTE_PREFIXES`.
7. `lib/collect-palette-items.ts`: extract and export `servesContext`.
8. `command-palette.tsx`: async lane, search provider, searching empty state, sub-page removed.
9. `_parts/palette-list.tsx`: status badge on the second line.
10. `providers/tools-provider.ts`: drop the `tools:search` row.
11. `test/unit/parse-palette-query.test.ts`, `test/unit/command-palette.test.tsx`: new cases and the
    query-client wrapper.
12. `apps/dashboard/src/locales/en.json`, `it.json`: add one key, remove four.

Delete:
13. `_parts/search-results-view.tsx`, `test/unit/search-results-view.test.tsx`.

Untouched on purpose: `index.ts` (no new export), `use-command-palette.ts`,
`lib/rank-palette-items.ts`, every other provider, `src/pages/*`, `App.tsx`,
`config/dashboard-menu.ts`, `lib/rpc.ts`, `lib/http/*`, everything in `packages/` and `apps/api`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Contract (`types.ts`)

Approach: additive, except the removal of the dead page. Reason: existing providers and test
literals keep compiling, and the async contract mirrors `PaletteProvider`'s routing fields, so one
rule (Task 3) serves both lanes.

`CommandPage` (L10): delete the `| "search-results"` member. Nothing else changes in the union.

Replace `PalettePrefix` (L41) with, verbatim:

```ts
/** A leading character that routes the query to the providers declaring it. Engine-owned table: lib/parse-palette-query.ts. */
export type PalettePrefix = "=" | "/"
```

Add to `PaletteItem`, verbatim, after `description` (import `Status` as a type from
`@/components/ui/status`):

```ts
  /** A content status, rendered as a StatusBadge before the second line (design rule: status only as a badge). */
  readonly status?: Status
```

Add after `PaletteProvider`, verbatim:

```ts
/**
 * A remote source. Routed like `PaletteProvider` (`pages`, `prefix`); its rows arrive after the local
 * ones, keep the order it returns and are never re-ranked lexically.
 */
export interface PaletteAsyncProvider extends Pick<PaletteProvider, "id" | "pages" | "prefix"> {
  /** Shortest `query` that triggers a fetch; below it the provider is silent and never pending. */
  readonly minQueryLength: number
  /** Must forward `signal` to its request. A rejection drops this source's rows silently. */
  readonly fetchItems: (context: PaletteQueryContext, signal: AbortSignal) => Promise<readonly PaletteItem[]>
}
```

Update the `PaletteProvider.getItems` comment only if it mentions sub-pages (it does not; leave it).
Barrel: unchanged.

### Task 2 — `/` prefix (`lib/parse-palette-query.ts`)

`PALETTE_PREFIXES` (L8) becomes `{ "=": true, "/": true }`. The parser itself does not change:
root page only, first character, rest trimmed. `"/ hello"` and `"/hello"` both give
`{ prefix: "/", text: "hello" }`.

### Task 3 — One routing rule (`lib/collect-palette-items.ts`)

Approach: move the two `continue` conditions at L28–L29 into an exported pure predicate and call it
from both `collectPaletteItems` and the async hook. Reason: one routing rule for both lanes; a
future change to prefix semantics cannot diverge.

```ts
/** Whether a provider of either lane contributes to `context`: it serves the page and, when a prefix is typed, declares it. */
export function servesContext(
  provider: Pick<PaletteProvider, "pages" | "prefix">,
  context: Pick<PaletteQueryContext, "page" | "prefix">,
): boolean
```

`collectPaletteItems` behaviour, signature and doc comment are unchanged.

### Task 4 — Async lane (`use-async-palette-items.ts`)

Approach: one `useQueries` over the async providers. Each query's key carries the typed text and
`queryFn` reads TanStack's `signal`. Reason: finding 2 gives cancellation per keystroke and a short
cache with no hand-written controller; it also isolates each source's failure.

```ts
export interface AsyncPaletteItems {
  /** One synchronous provider per async source whose rows for the CURRENT query have arrived; pass to collectPaletteItems. */
  readonly settled: readonly PaletteProvider[]
  /** true while a qualifying source has no answer yet for the current query (debounce window included). */
  readonly pending: boolean
}

export function useAsyncPaletteItems(
  providers: readonly PaletteAsyncProvider[],
  context: PaletteQueryContext,
): AsyncPaletteItems
```

Constants, module-private: `ASYNC_DEBOUNCE_MS = 300` and `ASYNC_STALE_TIME_MS = 30_000`. Both are
the old search page's values, so request volume and freshness do not change.

Rules:
- A provider **qualifies** when `servesContext(provider, context)` is true and
  `context.query.length >= provider.minQueryLength`.
- `debounced = useDebounce(context.query, ASYNC_DEBOUNCE_MS)`.
- One query per provider. Key `["command-palette", provider.id, context.page, context.prefix ?? "",
  context.query]`, `queryFn: ({ signal }) => provider.fetchItems(context, signal)`. Options:
  `enabled: qualifies && debounced === context.query`, `retry: false` (a failing source must not
  hold the lane for a retry), `staleTime: ASYNC_STALE_TIME_MS`. The key uses the live query, not
  the debounced one: each keystroke moves the observer, which aborts the in-flight request
  (finding 2), and a cached answer for the exact text shows at once.
- `settled` holds, in `providers` order, `{ id, pages, prefix, getItems: () => data }` for every
  qualifying provider whose query has data. A non-qualifying provider never appears, even if its
  cache has data.
- `pending` is true when any qualifying provider's query has neither data nor an error.
- A rejection (network, `ApiError`, abort) puts that provider in neither list. Nothing is thrown or
  toasted and no console noise is added, so the palette stays usable (brief §4).
- The returned object keeps its identity while no query state changes (`useQueries`' `combine`, or
  `useMemo` over each result's `data`/`status`), so the engine's `items` memo does not recompute on
  every render.

### Task 5 — Content search provider (`providers/content-search-provider.ts`)

```ts
export function createContentSearchProvider(deps: {
  t: TFunction
  seeds: readonly Seed[]
  /** Unix seconds → display text ("3 hours ago"). Injected so the provider stays clock-free. */
  formatUpdatedAt: (unixSeconds: number) => string
}): PaletteAsyncProvider
// id: "search", pages: ["root"], prefix: "/", minQueryLength: 2
```

Module-private `SEARCH_RESULT_LIMIT = 8` (the old page's value). Put a one-line comment on
`minQueryLength: 2` pointing to `SEARCH_LIMITS.QUERY_MIN_LENGTH` in
`apps/api/src/features/search/constants.ts` (finding 3).

`fetchItems({ query, permissions }, signal)`:
- Without `permissions.canAnywhere("content:read")`, resolve `[]` and send no request. This is the
  same gate the removed `tools:search` row had. It covers "no permissions payload ⇒ no protected
  surface" (brief §4). Per-seed visibility is the server's projection (`full-text-search.ts:L76`);
  the provider does not re-filter.
- Request: `rpc.api.search.$get({ query: { q: query, limit: String(SEARCH_RESULT_LIMIT) } }, { init:
  { signal } })`, then `.json()`. Copy the call shape of `_parts/search-results-view.tsx:L45` before
  deleting it. A rejection propagates unchanged; the lane handles it.
- One row per hit, in response order:
  - `id`: `search:${hit.id}`. Search rows are not pinnable (brief §4), and the `search` provider id
    is what entry 9 will exclude.
  - `section`: the label of the seed whose `slug === hit.schema_slug` in `seeds`, else
    `hit.schema_slug`.
  - `label`: `hit.title` trimmed, or `t("commandPalette.untitledEntry")` when it is empty.
  - `status`: `hit.status` when `isStatus(hit.status)` (`@/components/ui/status`), else absent.
  - `description`: `[hit.author_name, formatUpdatedAt(hit.updated_at)]`, skipping `null`/empty,
    joined with `" · "`. The author segment is omitted when `author_name` is `null`.
  - `icon`: `resolveIcon(seed?.dashboard?.icon)` (same as `content-provider.ts:L59`).
  - `perform`: `{ kind: "navigate", to: `/content/${hit.schema_slug}/${hit.id}` }`.
  - No `keywords`, `score`, `shortcut` or `requires`. The server already projected visibility, and
    async rows are not ranked.
- The excerpt is not rendered (brief rule 8 lists status, author and date only).

### Task 6 — Engine wiring (`command-palette.tsx`)

- Build `formatUpdatedAt` with `useCallback` on `i18n.language`:
  `formatDistanceToNow(new Date(unixSeconds * 1000), { addSuffix: true, locale })`, with the locale
  picked from a module-level `DATE_FNS_LOCALE: Record<string, Locale> = { it, en: enUS }` and an
  `enUS` fallback. Copy `recent-content-widget.tsx:L22`/`L62`/`L67`. Take `i18n` from the existing
  `useTranslation()` call.
- `asyncProviders = useMemo(() => [createContentSearchProvider({ t, seeds, formatUpdatedAt })],
  [t, seeds, formatUpdatedAt])`.
- Build the context once (`useMemo`): `{ page: currentPage, query: parsed.text, prefix:
  parsed.prefix, permissions: { can, canAnywhere, canGlobally } }`. Pass it to the existing
  `collectPaletteItems` call and to `useAsyncPaletteItems(asyncProviders, context)`.
- `items` = the ranked local rows (unchanged expression), followed by
  `collectPaletteItems(asyncResults.settled, context, describeMissing)` with no ranking (finding 4).
  Add these dependencies to the memo.
- `EmptyMessage` (L49) gets a prop `searching: boolean`. When it is true it renders
  `t("commandPalette.searching")` (existing key) instead of the "no results" text. The engine passes
  `asyncResults.pending`. `CommandEmpty` only mounts when no row is rendered, so "Searching…" shows
  only while nothing else matches. "No results" therefore never flashes before hits arrive.
- Remove the `search-results` branch (L207–L208) and render `PaletteList` unconditionally. Remove
  the `"search-results"` entry of `PLACEHOLDER` (L111) and the `SearchResultsView` import (L40).
- Update the provider-order comment (L118): search rows come after every local row.
- `ranked`, breadcrumbs, Escape handling, `perform` and the `copy` path do not change. No new
  markup or classes besides the `EmptyMessage` text switch.

### Task 7 — Status badge on rows (`_parts/palette-list.tsx`)

In `PaletteRow` (L27): when `item.status` is set, render `<StatusBadge status={item.status} />`
(`@/components/ui/status-badge`) at the start of the second line. Then show the existing text
(`disabledReason ?? description`, L29) after it, in a `flex items-center gap-2` row. Without
`status` the markup stays byte-identical to today. Use no colour classes or sizes beyond those
already in the file; the badge brings its own tokens. Run the design check on the file.

### Task 8 — Drop the sub-page entry point (`providers/tools-provider.ts`)

Delete the `tools:search` row (L23–L31) and the now-unused `Search` icon import. The `permissions`
parameter becomes unused, so drop it from the destructuring. Update the doc comment (L9) to "The
theme toggle." Reason: content search now answers in the root list, and the placeholder already says
"Search actions, content, seeds…".

### Task 9 — i18n (`locales/en.json`, `locales/it.json`)

Add under `commandPalette`:

| Key | en | it |
|-----|----|----|
| `untitledEntry` | `Untitled` | `Senza titolo` |

Remove from both files, after the sub-page is gone: `commandPalette.searchContent`,
`commandPalette.searchResults`, `commandPalette.noSearchResults`, `commandPalette.placeholderSearch`
(en L1088–L1090, L1105; it.json same lines). Keep `commandPalette.searching`, now used by
`EmptyMessage`. Before deleting each key, grep `apps/dashboard/src` for it: it must have no other
user.

### Task 10 — Tests

Unit tier, in `features/command-palette/test/unit/`, SPDX header, double quotes, `describe` = the
exported symbol, four zones, no fake timers, no sleeping. Never mock `servesContext`,
`collectPaletteItems` or `parsePaletteQuery` (Rule 3.10). The debounce is mocked to identity, with
the comment already used at `search-results-view.test.tsx:L15`: it only delays, and the tests are
about what is requested and shown. Fixtures: `CANONICAL_SEEDS` (posts → label "Post"),
`CANONICAL_ENTRIES[0]` (title "Canonical Post", status published) and `CANONICAL_USERS.editor.name`
for the author. Hit ids are UUIDv4 literals. A hand-built hit object is allowed: it is the HTTP
response shape, the boundary being mocked. Permissions come from the `permissionsFor` helper,
copied from `content-provider.test.ts:L17–L24` (copied, not imported, Rule 3.12).

`use-async-palette-items.test.tsx` (jsdom): `describe("useAsyncPaletteItems")`. `renderHook` with a
fresh `QueryClient({ defaultOptions: { queries: { retry: false } } })` wrapper per test. Async
providers are built inline: `fetchItems` is a `vi.fn()` resolving rows or a promise the test
settles. Mock `@/hooks/use-debounce`.
- a query shorter than `minQueryLength` calls no provider and is not pending
- a qualifying query is pending until the provider resolves, then exposes its rows through one
  settled provider and is no longer pending
- a provider that does not serve the current page is never called
- with a prefix in the context, a provider declaring another prefix is never called
- changing the query aborts the signal passed to the in-flight request (comment: the brief's "a new
  keystroke cancels the previous search"; the abort comes from the key change)
- after the query changes, the previous query's rows are not exposed while the new one is pending
- a rejecting provider ends with no settled entry and not pending, and the hook does not throw
- a provider answering for the same text again within the stale time is not called a second time

`content-search-provider.test.ts` (`// @vitest-environment node`):
`describe("createContentSearchProvider")`. `vi.mock("@/lib/rpc", …)` exposing
`rpc.api.search.$get` as a `vi.fn()` (copy `search-results-view.test.tsx:L12–L14`). Stub `t` and
`formatUpdatedAt` (e.g. `(s) => \`at ${s}\``), so descriptions are deterministic.
- without `content:read` on any scope it resolves to no rows and sends no request
- it requests the context's query with limit `"8"` and forwards the given signal in `init`
- a hit maps to a row with id `search:<id>`, the hit title as label, the seed label as section,
  the status, `author · formatted date` as description and a navigate perform to
  `/content/<slug>/<id>`
- a hit whose `author_name` is null has only the formatted date as description
- a hit with an empty title is labelled with the untitled text
- a hit whose status the badge does not know carries no status
- a hit of a seed missing from the schema uses its slug as the section
- a failing request rejects with the same error (comment: the lane drops the source; the provider
  must not swallow it)

`parse-palette-query.test.ts` (existing): add
- a leading `/` on the root page is returned as the prefix and stripped from the trimmed text

`command-palette.test.tsx` (existing, jsdom):
- Mechanical setup changes (no existing assertion changes). Add a local
  `renderPalette(hostProviders)` that renders inside a fresh `QueryClientProvider` (retry off), and
  route every existing `render(<CommandPalette …/>)` through it. Add `vi.mock("@/lib/rpc", …)` and
  the identity `vi.mock("@/hooks/use-debounce", …)` at the top with the other mocks. In
  `beforeEach`, make the search mock resolve to an empty page by default (`{ items: [], nextCursor:
  null, total: 0 }`), so the existing typing tests see no extra rows. Without `content:read` they
  send no request anyway.
- New cases (grant `content:read@posts` where a request is expected; hits built from the canonical
  entry):
  - typing a term lists the matching local rows at once and appends the search rows after them
    once the request resolves
  - typing `2025-5` with a content hit titled `2025-5` lists the calculator row first and the
    content row second (comment: the brief's coexistence example, rule 9)
  - while the search is pending and no local row matches, the list shows "Searching…" and not
    "No results"
  - a failing search keeps the local rows and shows no toast
  - typing `/` followed by a term lists only search rows (no navigation or content-type rows)
  - a blank query sends no search request
  - a search row shows the "Published" status badge and the author name on its second line
  - selecting a search row navigates to `/content/posts/<id>` and closes the dialog
  - the idle root lists no "Search content…" row (regression guard: the sub-page entry point is
    gone)

Delete `test/unit/search-results-view.test.tsx` with the component. Its two behaviours (request
shape, navigate on select) are covered by the provider test and the palette test above.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

From the repo root unless stated:

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` (TypeScript 7; no output = pass)
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx apps/dashboard/src/features/command-palette/_parts/palette-list.tsx`
- `pnpm beech test --diff`. Exit 0 is required. It ignores untracked files, so also run, in
  `apps/dashboard`:
  `npx vitest run src/features/command-palette src/pages/palette-providers.test.ts src/test/cross-slice/app.test.tsx`
- `pnpm --filter @beechcms/dashboard build`
- Dead-code grep: `grep -rnE "search-results|SearchResultsView|searchContent|noSearchResults|placeholderSearch|commandPalette\.searchResults" apps/dashboard/src`
  returns nothing.
- VSA grep: `grep -rn "@/features/" apps/dashboard/src/features/command-palette --include=*.ts --include=*.tsx | grep -v "@/features/shared\|@/features/command-palette"`
  returns nothing.
- Graph re-check: `graphify update . --force`, then
  `graphify affected "useAsyncPaletteItems()" --depth 2` and
  `graphify affected "createContentSearchProvider()" --depth 2` list only files inside
  `features/command-palette`.
- Manual (human gate, dev stack running with `pnpm beech dev`): open the palette, type a term
  present in an entry body but not in its title. Local rows appear at once, the hit appends with
  its badge, author and relative date, and DevTools → Network shows the earlier requests as
  cancelled while typing fast.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PalettePrefix`, `PaletteItem.status`, `PaletteAsyncProvider`, `servesContext`,
      `AsyncPaletteItems`, `useAsyncPaletteItems` and `createContentSearchProvider` match Section 4
      verbatim; `CommandPage` no longer contains `search-results`.
- [ ] Every other provider, `src/pages/*` and the existing context-building tests compile without
      edits; `command-palette.test.tsx` changes only its render wrapper and mocks for existing cases.
- [ ] Local rows render on every keystroke without waiting for the network; search rows are appended
      after them, in server order, once they arrive.
- [ ] A new keystroke aborts the in-flight search request (hook test); requests are debounced 300 ms
      and an identical query within 30 s is served from cache.
- [ ] A failing or aborted search leaves the palette usable with no error toast or blocking message.
- [ ] A blank query or a query under 2 characters sends no request and lists no content entry.
- [ ] Without `content:read` on any scope, no request is sent and no search row appears.
- [ ] `/` routes to content search only; without a prefix, search rows coexist with every local
      provider (`2025-5`: calculator row first, content row second).
- [ ] Search row: title (or the untitled text) as label, seed label as section, `StatusBadge` for a
      known status, `author · relative date` as description with the author omitted when `null`,
      Enter opens `/content/<slug>/<id>` and closes.
- [ ] While search is pending and nothing else matches, the list shows "Searching…", never
      "No results".
- [ ] The `search-results` sub-page, `SearchResultsView`, its test, the `tools:search` row and the
      four orphaned locale keys are gone (dead-code grep clean).
- [ ] Every new string is a `t()` key in both `en.json` and `it.json`.
- [ ] `features/command-palette` imports no feature slice other than `@/features/shared`.
- [ ] Design-token check clean on `command-palette.tsx` and `_parts/palette-list.tsx`; status is
      shown only through `StatusBadge`.
- [ ] `tsc`, lint, the explicit vitest run, `pnpm beech test --diff` and the dashboard build pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:
- Row secondary actions, the actions submenu, copy-ID and their key bindings → roadmap entry 4b
  `BeechPalRowActions`.
- `#` notes prefix and Quick Notes → entry 5 `BeechPalQuickNotes` (a full hex literal must keep
  reaching the conversions provider).
- Context actions, the `features/shared` declaration contract, confirm dialogs → entry 6
  `BeechPalContextActions`.
- `>` system commands, preference toggles, the keyboard-shortcuts row, recent items → entry 7
  `BeechPalSystemCommands`.
- `users.ui_prefs`, migrations, preference endpoints → entry 8 `UiPreferencesApi`. Pins → entry 9
  `BeechPalPins` (search rows are never pinnable; entry 9 excludes provider `search`).
- Semantic search, embeddings, rank fusion and any AI feature (brief §5). The async contract is
  the only preparation.
- Search extras: excerpt rendering or highlighting, pagination or a "more results" row,
  `schema_slug`/`status` filters, a per-seed scope chip, client-side re-ranking of hits, retry,
  a loading skeleton, exporting `PaletteAsyncProvider` from the barrel or accepting async host
  providers in `CommandPaletteProps`.
- Any change to `GET /api/search`, `SearchResultItem`, `lib/rpc.ts`, `lib/http/*`,
  `lib/query-client.ts` or the query-cache persistence allow-list.
- Changes to `use-command-palette.ts`, `lib/rank-palette-items.ts`, the calculator, conversions,
  navigation and content providers, `src/pages/*`, `App.tsx`, `config/dashboard-menu.ts`.
- Any file in `packages/` or `apps/api`.
