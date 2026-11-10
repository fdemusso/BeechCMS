# Sprint Plan — BeechPalLocalTools (BeechPal, sprint 2 of 9)

Roadmap: `stages/01_sprint_planning/output/backlog/ROADMAP.md` (entry 2).
Feature brief: `stages/00_ideation/output/feature_brief.md`.
Previous sprint (shipped, review PASS): `docs/Sprints/BeechPalProviderEngine/` (plan, execution log, review).

### Pre-Computation Analysis

Graph refreshed with `graphify update . --force` (30055 nodes, 43901 edges) before any query.

**a) God Nodes identified via the CLI**

| Node | Source | Role in this sprint |
|------|--------|---------------------|
| `CommandPalette()` | `features/command-palette/command-palette.tsx:L91` | Engine entry. Gains prefix parsing, two providers, the `copy` perform. Public props unchanged. |
| `collectPaletteItems()` | `features/command-palette/lib/collect-palette-items.ts:L18` | Gains prefix routing (provider filter). Signature unchanged. |
| `rankPaletteItems()` | `features/command-palette/lib/rank-palette-items.ts:L12` | Gains the per-item `score` override. Signature unchanged. |
| `PalettePerform` / `PaletteItem` / `PaletteProvider` / `PaletteQueryContext` | `features/command-palette/types.ts:L41`, `L46`, `L68`, `L61` | Contract gets one perform kind and three optional fields. Every addition is optional or a new union member, so existing providers compile unchanged. |
| `usePermissions()` | `features/shared/hooks/use-permissions.ts:L60` | Consumed, unchanged. The new providers gate nothing (no permission governs a local computation). |

**b) Architectural boundaries affected**

- `@beechcms/core`: none.
- `apps/api`: none. Local tools are client-only and offline (brief §4, "deterministiche e offline").
- `apps/dashboard`:
  - `src/features/command-palette/` (owner slice): contract, prefix parser, ranking override, two pure
    libraries (expression evaluator, value converter), two providers, engine wiring, `copy` perform.
  - `src/locales/en.json`, `src/locales/it.json`: new `commandPalette.*` keys.
  - Nothing in `src/pages/` (the composition root) changes: the new providers need no other slice.

**c) `graphify affected` impact analysis**

```
graphify affected "rankPaletteItems()" --depth 2
- command-palette.tsx [imports]            features/command-palette/command-palette.tsx:L1
- rank-palette-items.test.ts [imports]     features/command-palette/test/unit/rank-palette-items.test.ts:L1
- index.ts [re_exports]                    features/command-palette/index.ts:L1

graphify affected "collectPaletteItems()" --depth 2
- command-palette.tsx [imports]            features/command-palette/command-palette.tsx:L1
- collect-palette-items.test.ts [imports]  features/command-palette/test/unit/collect-palette-items.test.ts:L1
- index.ts [re_exports]                    features/command-palette/index.ts:L1

graphify affected "CommandPalette()" --depth 2
- App.tsx, index.ts, app-command-palette.tsx, command-palette.test.tsx, app.test.tsx, main.tsx,
  palette-providers.ts, palette-providers.test.ts

graphify affected "createToolsProvider()" --depth 2
- command-palette.tsx [imports]; index.ts [re_exports]      (slice-internal only)

graphify explain "PalettePerform"
- degree 2: types.ts [contains], index.ts [re_exports]
```

Breaking-change verdict: the only consumers of the contract outside the slice are
`src/pages/palette-providers.ts` and its test. They build `PaletteItem`s and `PaletteQueryContext`s
and narrow `perform.kind` with `if` (`palette-providers.test.ts:L41`), never with an exhaustive
switch. The only exhaustive switch over `PalettePerform` is `command-palette.tsx:L139`, which this
sprint extends. Five test files build `PaletteQueryContext` literals without a prefix
(`collect-palette-items.test.ts:L46`, `navigation-provider.test.ts:L29`, `content-provider.test.ts:L47`,
`palette-providers.test.ts:L51`, `L81`). That is why `prefix` is optional: those files keep compiling
untouched. `CommandPaletteProps` and the `hostProviders` injection do not change, so neither do
`App.tsx` and `app-command-palette.tsx`.

Findings that shape the plan:
1. cmdk's `defaultFilter` returns at most `1` (`node_modules/cmdk/dist/chunk-*.mjs`, constant `U=1`
   for a full match). It scores `label + keywords + section` as one string, so a lexical row
   only reaches `1` in degenerate cases. A computed row scored `1` therefore ranks first, and its
   provider sits first in provider order so that ties (stable sort, `rank-palette-items.ts:L26`) also
   go to it. This is the "2025-5" rule (brief §4).
2. The repo's copy-to-clipboard idiom is `navigator.clipboard.writeText(v).then(success, failure)`
   with `toast` from `sonner` (`lib/dynamic-columns.tsx:L435`). The design system allows exactly
   `toast.success` / `toast.error`, and only to confirm an action that already happened
   (`_config/design_system.html`, "Empty states, Skeleton, toasts"). `common.copied` exists but reads
   "ID copied", which is wrong here. `common.copyFailed` ("Copy failed" / "Copia fallita") fits as is.
3. i18n runs with `escapeValue: false` (`lib/i18n.ts:L22`, `test/setup.ts:L24`). Interpolating `/`
   or `*` into a label renders them literally.
4. Icons exist in `reicon-react` behind `@/components/icons`: `Calculator`, `Ruler`, `HardDrive`,
   `Palette`, `Clock`.
5. Prefix collision ahead: hex colours start with `#`, the Quick Notes prefix (roadmap entry 5). This
   sprint ships hex → rgb reachable as `#ff0000`. Entry 5 is annotated in the roadmap: a query that
   is a complete hex literal must not route to notes.

### VETO Audit

Evaluated against `_config/ponytail_arch.md`.

- **Rule 1, YAGNI.** Every node serves a user story of this sprint. The prefix router ships with one
  prefix (`=`) because the brief asks for it now and three later sprints add theirs to the same table.
  The score override exists because a computed row's label never contains the query, so lexical
  scoring alone would drop it. Cut as speculative: no `%`/modulo, no locale decimal comma, no implicit
  multiplication, no alpha hex, no date → timestamp direction, no bits (only bytes), no configurable
  rem base, no history of results, no copy-without-closing. **No VETO.**
- **Rule 2, Botanical invariant.** No data access of any kind: the evaluator and converter are pure
  functions over the typed string. No D1, no API, no field names. **Respected.**
- **Rule 3, VSA.** All new code lives in `features/command-palette/`. It imports only `cmdk`,
  `sonner`, `i18next` types, `@/components/icons` and the slice's own files. Zero new cross-feature
  imports, and the composition root is untouched. **Respected.**
- **Rule 4, Cloudflare purity.** Client-only, offline, no Worker call per keystroke. Safe parser:
  no `eval`, no `Function`, no `with` (brief §4, "nessuna valutazione dinamica di codice"). **Respected.**
- **Rule 5, minimal blueprint.** Tier footprint: core 0, api 0. Dashboard: 1 slice, 5 new source files
  plus 5 edited, and 2 locale files. **Respected.**

HANDOFF -> caveman_coder

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

Sprint 1 turned the palette into a provider aggregator. Before any async source (content search,
sprint 4) joins it, the engine must answer two questions that only synchronous providers can prove
cheaply:

- **Coexistence (brief rule 9).** An ambiguous input yields several rows, ordered by relevance, and
  none is hijacked. A computed row ("2025-5 = 2020") has no lexical relation to the query, so ranking
  needs a per-item score next to the lexical one. Proving it now on local rows means sprint 4 only
  adds the async lane, not a second ranking model.
- **Prefix routing (brief rule 7).** Four prefixes arrive over sprints 2, 4, 5 and 7. One engine-owned
  table and one routing rule in `collectPaletteItems` are built here with the first prefix (`=`), so
  later sprints add one table entry and one `prefix` field on their provider.

On top of these the sprint delivers the brief's local-tool stories: arithmetic, CSS units,
storage units, hex → rgb and Unix timestamps. Each is answered in-row, synchronously (rule 10), and
Enter copies the value, closes the palette and confirms with a toast.

VSA: everything lives in the palette slice; the new providers need no other slice, so the
composition root does not change. Botanical invariant: no data is read or written; nothing touches
`@beechcms/core`, D1 or the API.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Engine** (`command-palette.tsx`). `CommandPalette({ hostProviders })` (L91) builds the providers in
idle-group order: navigation, content, host providers, tools (L115–L123). It computes
`query = search.trim()` (L125) and `items = rankPaletteItems(collectPaletteItems(providers, { page:
currentPage, query, permissions }, describeMissing), query)` (L126–L135). `perform` (L137) switches on
`navigate` (navigate + close), `page` (push) and `run` (run + close). cmdk runs with
`shouldFilter={false}` (L173). `PaletteList` receives `ranked={query.length > 0}` (L189); while typing
it renders one flat list with the section label on each row (`_parts/palette-list.tsx:L56`). The
`search-results` page still renders `SearchResultsView` (L186).

**Contract** (`types.ts`). `PalettePerform` (L41), `PaletteItem` (L46), `PaletteQueryContext` (L61,
`page`, `query`, `permissions`), `PaletteProvider` (L68, `id`, `pages`, `getItems`),
`ResolvedPaletteItem` (L76). Barrel (`index.ts:L10`) exports the types; `lib/` and `providers/` stay
internal.

**Collection** (`lib/collect-palette-items.ts:L18`). Filters providers by `pages`, isolates a throwing
provider (L30), drops duplicate ids (L38) and resolves `requires`. It knows nothing of prefixes.

**Ranking** (`lib/rank-palette-items.ts:L12`). A blank query returns a copy in input order. Otherwise
it scores with `defaultFilter(label, needle, [...keywords, section])`, drops `0`, and runs a stable
sort descending.

**State** (`use-command-palette.ts`). Owns `search`; closing resets search and pages (L66). Unchanged
this sprint.

**Clipboard and toasts.** No palette code copies today. Pattern: `lib/dynamic-columns.tsx:L435`.
Features import `toast` straight from `sonner` (e.g. `features/automations/hooks/use-create-automation.ts:L6`).

**Tests today.** Unit suites in `features/command-palette/test/unit/`: `collect-palette-items`,
`rank-palette-items`, `navigation-provider`, `content-provider` (node env, real evaluator through a
local `permissionsFor`, stub `t` at `content-provider.test.ts:L26`) and `command-palette.test.tsx` (jsdom,
real i18n English strings, `@/features/shared` and `react-router-dom` mocked at L16–L29).

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Create (all under `apps/dashboard/src/features/command-palette/`):
1. `lib/parse-palette-query.ts`: prefix table and parser.
2. `lib/evaluate-expression.ts`: safe arithmetic evaluator.
3. `lib/convert-value.ts`: CSS / storage / colour / timestamp converter.
4. `providers/calculator-provider.ts`
5. `providers/conversions-provider.ts`
6. Tests: `test/unit/parse-palette-query.test.ts`, `test/unit/evaluate-expression.test.ts`,
   `test/unit/convert-value.test.ts`, `test/unit/calculator-provider.test.ts`,
   `test/unit/conversions-provider.test.ts`.

Edit:
7. `types.ts`: `PalettePrefix`, `copy` perform, optional `score`, `prefix` (provider and context).
8. `lib/collect-palette-items.ts`: prefix routing.
9. `lib/rank-palette-items.ts`: score override, `EXACT_MATCH_SCORE`.
10. `command-palette.tsx`: parse the query, register the two providers first, handle `copy`.
11. `index.ts`: export the `PalettePrefix` type.
12. `test/unit/collect-palette-items.test.ts`, `test/unit/rank-palette-items.test.ts`,
    `test/unit/command-palette.test.tsx`: new cases (existing cases untouched).
13. `apps/dashboard/src/locales/en.json`, `it.json`: new keys.

Untouched on purpose: `_parts/palette-list.tsx` (computed rows are ordinary rows),
`use-command-palette.ts`, `_parts/search-results-view.tsx`, every existing provider, `src/pages/*`,
`App.tsx`, `config/dashboard-menu.ts`, everything in `packages/` and `apps/api`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

### Task 1 — Contract additions (`types.ts`)

Approach: additive only. Every new field is optional and the one new perform kind is a union member.
Reason: sprint 1's providers, the composition root and five test files keep compiling unchanged.

Add, verbatim, next to the existing types:

```ts
/** A leading character that routes the query to the providers declaring it. Engine-owned table: lib/parse-palette-query.ts. */
export type PalettePrefix = "="
```

Replace `PalettePerform` (L41) with, verbatim:

```ts
/** What selecting a row does. The engine closes the palette after `navigate`, `run` and `copy`. */
export type PalettePerform =
  | { readonly kind: "navigate"; readonly to: string }
  | { readonly kind: "page"; readonly page: CommandPage }
  | { readonly kind: "run"; readonly run: () => void }
  | { readonly kind: "copy"; readonly value: string }
```

Add to `PaletteItem`, verbatim, after `requires`:

```ts
  /**
   * Relevance on cmdk's scale (0, 1], used instead of the lexical score while typing.
   * For computed rows, whose label never contains the query. Ignored when the query is blank.
   */
  readonly score?: number
```

Add to `PaletteQueryContext`, verbatim, after `query`:

```ts
  /** The prefix the user typed; `query` then excludes it. Absent: no prefix. */
  readonly prefix?: PalettePrefix
```

Add to `PaletteProvider`, verbatim, after `pages`:

```ts
  /**
   * When the query starts with this prefix, only providers declaring it contribute.
   * A provider declaring a prefix still answers un-prefixed queries.
   */
  readonly prefix?: PalettePrefix
```

Barrel (`index.ts:L10`): add `PalettePrefix` to the type export list.

### Task 2 — `parsePaletteQuery` (`lib/parse-palette-query.ts`)

```ts
import type { CommandPage, PalettePrefix } from "../types"

/** Every routable prefix. `Record` makes tsc reject a `PalettePrefix` member missing here. */
export const PALETTE_PREFIXES: Readonly<Record<PalettePrefix, true>> = { "=": true }

export interface ParsedPaletteQuery {
  /** Absent when the query carries no prefix. */
  readonly prefix?: PalettePrefix
  /** The query without its prefix, trimmed. */
  readonly text: string
}

export function parsePaletteQuery(raw: string, page: CommandPage): ParsedPaletteQuery
```

Rules:
- Prefixes exist only on page `root`. On any other page the result is `{ text: raw.trim() }`, so a
  leading `=` on the `seeds` page is plain text.
- After trimming, a first character that is a key of `PALETTE_PREFIXES` is the prefix. `text` is
  the rest, trimmed. `"= 2+2"` and `"=2+2"` both give `{ prefix: "=", text: "2+2" }`; a lone `"="`
  gives `{ prefix: "=", text: "" }`.
- Otherwise `{ text: raw.trim() }`, with no `prefix` key.
- Pure, never throws. The key test (`in` / `Object.hasOwn`) must not match inherited properties.

### Task 3 — Prefix routing (`lib/collect-palette-items.ts`)

Approach: route inside `collectPaletteItems`, next to the existing page filter. Reason: it is the
pure, already-tested place that decides which providers contribute. Signature and doc comment are
otherwise unchanged; add one sentence to the doc comment about prefixes.

Rule, applied after the `pages` filter (L27): when `context.prefix` is set, skip every provider whose
`prefix !== context.prefix`. When it is absent, every provider serving the page contributes,
including those that declare a prefix. Ordering, duplicate-id handling, error isolation and
`requires` resolution do not change.

### Task 4 — Score override (`lib/rank-palette-items.ts`)

Add, verbatim, exported:

```ts
/** cmdk's score for a full match. Computed rows use it: the whole query is their subject. */
export const EXACT_MATCH_SCORE = 1
```

Behaviour changes: while the query is non-blank, an item's score is `item.score` when defined,
otherwise `defaultFilter(...)` as today. Everything else stays: a score `<= 0` drops the item, the
sort is stable and descending, a blank query returns input order (so `score` is ignored there), and
the input is not mutated. Update the doc comment with one sentence on the override.

### Task 5 — Safe evaluator (`lib/evaluate-expression.ts`)

Approach: a hand-written tokenizer plus a recursive-descent parser over numbers. Reason: the brief
forbids dynamic code evaluation. The grammar is small enough that a dependency would be heavier than
the code.

```ts
export interface EvaluatedExpression {
  readonly value: number
  /** true when at least one binary operator was applied (`2+3`), false for a lone operand (`-5`, `(7)`). */
  readonly compound: boolean
}

/** Evaluates `+ - * / ^` and parentheses over decimal numbers. null when the input is not a complete, finite expression. Never throws. */
export function evaluateExpression(input: string): EvaluatedExpression | null
```

Grammar and rules:
- Tokens: numbers `\d+(\.\d+)?` or `\.\d+` (dot as the decimal separator); operators `+ - * / ^`;
  `(` and `)`; whitespace is ignored. Any other character (letters, `,`, `%`, `=`, `x`, unicode
  operators) makes the input invalid. So "16px", "1,5" and "2025-05-10T" all give `null`.
- Precedence, lowest to highest: `+ -` (left-assoc), `* /` (left-assoc), unary `+ -`, `^`
  (right-assoc), then parentheses or a number. So `-2^2 = -4`, `2^-1 = 0.5`, `2^3^2 = 512`,
  `2-3-4 = -5`.
- No implicit multiplication: `2(3)` and `(1)(2)` are invalid.
- Incomplete or unbalanced input is `null`: `2+`, `(1+2`, `1+2)`, `*3`, the empty string, and
  whitespace only.
- Division by zero or any non-finite result (`1/0`, `0/0`, `10^400`) is `null` (brief §4: no row,
  no visible error).
- Guards: input longer than 200 characters is `null` before tokenizing; parenthesis nesting deeper
  than 32 is `null`. Constants `MAX_EXPRESSION_LENGTH = 200`, `MAX_EXPRESSION_DEPTH = 32`, module
  private.
- `compound` is true when the parse applied at least one binary operator. Unary signs do not count.
- Pure: same input gives the same output. No `eval`, `Function`, `with`, or `new` of anything dynamic.

### Task 6 — Converter (`lib/convert-value.ts`)

Approach: one pure function trying four recognisers in a fixed order and returning the first match.
Reason: the brief wants conversions recognised from the input without a prefix. The recognisers are
disjoint by construction (unit suffix, `#`, digit count), so the order only documents intent.

```ts
export type ConversionKind = "css" | "storage" | "color" | "unix-seconds" | "unix-millis"

export interface Conversion {
  readonly kind: ConversionKind
  /** The source as recognised, normalised: "16px", "1 GB", "#ff0000", "1700000000". */
  readonly from: string
  /** Copy-ready result: "1rem", "0.9313 GiB", "rgb(255, 0, 0)", "2023-11-14T22:13:20.000Z". */
  readonly to: string
}

/** The px ↔ rem base, shown on the row (brief: "base dichiarata"). */
export const REM_BASE_PX = 16

/** null when the input is not a recognised conversion. Never throws. */
export function convertValue(input: string): Conversion | null
```

Common rules:
- Input is trimmed. Inputs over 100 characters are `null`. Units and connectors are
  case-insensitive. A connector is ` to `, ` in ` or `->` (spaces optional around `->`), followed by
  the target unit.
- Number literal: `-?(\d+(\.\d+)?|\.\d+)`. Results use one formatting rule: `|x| >= 1` (or exactly
  0) keeps at most 4 fraction digits, trailing zeros trimmed; `0 < |x| < 1` keeps 4 significant
  digits. Output uses plain JS number text (no locale grouping), so the copied value pastes into CSS
  and code. `-0` prints as `0`.
- A target equal to the source unit is `null`. An unknown target is `null`.

Recognisers:
- **css**: `<n>px` or `<n>rem` (space before the unit optional), optional connector + `px|rem`.
  Without a target the result is the other unit. px → rem divides by `REM_BASE_PX`, rem → px
  multiplies. `from` is `"<n>px"`, `to` is `"<result>rem"`, with no space before the unit (CSS form).
- **storage**: `<n> <unit>` with unit in `B, KB, MB, GB, TB` (decimal, powers of 1000) or
  `KiB, MiB, GiB, TiB` (binary, powers of 1024), optional connector + unit. Without a target the
  result is the same magnitude in the other system (KB ↔ KiB, MB ↔ MiB, GB ↔ GiB, TB ↔ TiB); a bare
  `B` without a target is `null`. Negative values are `null`. Bits are not supported: `mb` is read
  as MB (case-insensitive by design). `from`/`to` print the canonical unit casing with one space:
  `"1 GB"`, `"0.9313 GiB"`.
- **color**: `#` plus exactly 3 or 6 hex digits, optional ` to rgb`. The result is `rgb(r, g, b)`;
  a 3-digit form expands each digit (`#f00` → `rgb(255, 0, 0)`). Any other length (4, 8, …) is
  `null`. `from` is the lowercased input hex.
- **unix-seconds / unix-millis**: the whole input is an unsigned integer of exactly 10 digits
  (seconds) or exactly 13 digits (milliseconds). The result is the ISO 8601 UTC string
  (`toISOString()`). It depends only on the input, never on the current time. Other digit counts
  are `null`.

### Task 7 — Calculator provider (`providers/calculator-provider.ts`)

```ts
export function createCalculatorProvider(deps: { t: TFunction }): PaletteProvider
// id: "calc", pages: ["root"], prefix: "="
```

`getItems({ query, prefix })`:
- `evaluateExpression(query)`. On `null`, emit nothing.
- Without a prefix, emit only when `compound` is true. A lone number ("2025") is a search, not a
  calculation. With `prefix === "="`, a lone operand is fine (`=-5` shows `-5`).
- Format the result as plain JS number text after rounding to 12 significant digits, so `0.1+0.2`
  shows `0.3`. `-0` prints as `0`. Results whose magnitude makes JS use exponent notation keep it
  (`1e+21`).
- One row: id `calc:result`, section `t("commandPalette.calculator")`, label
  `t("commandPalette.calculatorResult", { expression: query, result })`, description
  `t("commandPalette.copyHint")`, icon `Calculator`, `score: EXACT_MATCH_SCORE`,
  perform `{ kind: "copy", value: result }`. The copied value is the bare number, not the equation.
- Ignores `permissions`: a local computation needs none (nothing to disable or hide).

### Task 8 — Conversions provider (`providers/conversions-provider.ts`)

```ts
export function createConversionsProvider(deps: { t: TFunction }): PaletteProvider
// id: "convert", pages: ["root"], no prefix
```

`getItems({ query })`:
- `convertValue(query)`. On `null`, emit nothing.
- One row: id `convert:<kind>`, section `t("commandPalette.conversion")`, label
  `t("commandPalette.conversionResult", { from, to })`, `score: EXACT_MATCH_SCORE`, perform
  `{ kind: "copy", value: to }`.
- Icon and description by kind:
  - `css`: `Ruler`, `t("commandPalette.conversionHint.css", { base: REM_BASE_PX })`
  - `storage`: `HardDrive`, `t("commandPalette.conversionHint.storage")`
  - `color`: `Palette`, `t("commandPalette.copyHint")`
  - `unix-seconds`: `Clock`, `t("commandPalette.conversionHint.unixSeconds")`
  - `unix-millis`: `Clock`, `t("commandPalette.conversionHint.unixMillis")`
- No prefix: under `=` it does not contribute (Task 3), so `=16px` gives no row.

### Task 9 — Engine wiring (`command-palette.tsx`)

- Parse once: `parsed = parsePaletteQuery(search, currentPage)`, memoised on `[search, currentPage]`.
  `collectPaletteItems` gets `{ page: currentPage, query: parsed.text, prefix: parsed.prefix,
  permissions }` and `rankPaletteItems` gets `parsed.text`. Replace the L125 `query` accordingly.
  `ranked` stays "the raw input is non-blank" (`search.trim().length > 0`), so `=` alone already
  shows the flat ranked layout.
- Provider order becomes: calculator, conversions, navigation, content, host providers, tools. The
  two new ones go first so equal scores go to the computed row (finding 1). Idle grouping does not
  change, because both emit nothing for a blank query. Update the L114 comment. Both factories take
  `{ t }` and join the existing `useMemo`.
- `perform` gains `case "copy"`, the same idiom as `lib/dynamic-columns.tsx:L435`. Start
  `navigator.clipboard.writeText(value)`, then `setOpen(false)` right away, like `run`. On resolve,
  call `toast.success(t("commandPalette.copied", { value }))`. On reject, call
  `toast.error(t("common.copyFailed"))`. When `navigator.clipboard` is unavailable (insecure
  context, older browser), skip the write, call `toast.error(t("common.copyFailed"))` and still close.
  No unhandled rejection, nothing thrown. `toast` is imported from `sonner`.
- `EmptyMessage`, breadcrumbs, placeholders, Escape handling and the `search-results` branch do not
  change.
- Design: no new markup, classes or colours. Computed rows render through the unchanged
  `PaletteList` / `PaletteRow`. Run `node scripts/check-design-tokens.mjs --format agent` on
  `command-palette.tsx`.

### Task 10 — i18n (`locales/en.json`, `locales/it.json`)

Add under `commandPalette`. Each line gives the key, then the en text, then the it text:

| Key | en | it |
|-----|----|----|
| `calculator` | `Calculator` | `Calcolatrice` |
| `conversion` | `Conversion` | `Conversione` |
| `calculatorResult` | `{{expression}} = {{result}}` | `{{expression}} = {{result}}` |
| `conversionResult` | `{{from}} = {{to}}` | `{{from}} = {{to}}` |
| `copyHint` | `Enter to copy` | `Invio per copiare` |
| `copied` | `Copied {{value}}` | `Copiato {{value}}` |
| `conversionHint.css` | `Base {{base}}px · Enter to copy` | `Base {{base}}px · Invio per copiare` |
| `conversionHint.storage` | `1 KB = 1000 B, 1 KiB = 1024 B · Enter to copy` | `1 KB = 1000 B, 1 KiB = 1024 B · Invio per copiare` |
| `conversionHint.unixSeconds` | `Unix seconds, UTC · Enter to copy` | `Secondi Unix, UTC · Invio per copiare` |
| `conversionHint.unixMillis` | `Unix milliseconds, UTC · Enter to copy` | `Millisecondi Unix, UTC · Invio per copiare` |

`conversionHint` is a nested object. Reuse `common.copyFailed` and add no copy of it. Remove no key.

### Task 11 — Tests

All unit tier, in `features/command-palette/test/unit/`, `// @vitest-environment node` on line 1
except `command-palette.test.tsx` (jsdom, existing). SPDX header, double quotes, and `describe` = the
exported symbol. The pure libraries need no fixtures: their inputs are strings. The two provider suites
build `permissions` with the local `permissionsFor` helper over an empty payload (copy the shape of
`content-provider.test.ts:L14–L24`) and a stub `t` that appends the interpolated values (copy
`content-provider.test.ts:L26`). Never mock `evaluateExpression` or `convertValue` (Rule 3.10).
Matrices (Rule 1.6) are allowed where noted, driven from an array.

`parse-palette-query.test.ts`: `describe("parsePaletteQuery")`
- a leading `=` on the root page is returned as the prefix and stripped from the trimmed text
- `=` followed by spaces and an expression yields the same text as without the spaces
- a lone `=` yields the prefix with empty text
- a leading `=` on a sub-page is plain text and yields no prefix
- a query without a prefix character yields no prefix and the trimmed text
- a prefix character after other text is not a prefix (`"2=2"`)

`evaluate-expression.test.ts`: `describe("evaluateExpression")`
- precedence and associativity matrix: `2+3*4 → 14`, `2-3-4 → -5`, `2^3^2 → 512`, `-2^2 → -4`,
  `2^-1 → 0.5`, `(2+3)*4 → 20`, `.5+1 → 1.5` (one cause: grammar)
- `2025-5` evaluates to 2020 and is compound
- a lone operand (`-5`, `(7)`) is not compound
- invalid or incomplete input matrix gives null: `2+`, `(1+2`, `1+2)`, `*3`, `2(3)`, `1,5`, `16px`,
  `""`, `"   "`
- division by zero and overflow give null (`1/0`, `0/0`, `10^400`)
- input above the length cap gives null (comment: the cap bounds parser work per keystroke)
- nesting deeper than the depth cap gives null (comment: the cap bounds recursion)
- identifier-looking input such as `alert(1)` or `constructor` gives null (regression guard: no
  dynamic code evaluation)

`convert-value.test.ts`: `describe("convertValue")`
- `16px` and `16px to rem` both convert to `1rem`; `1.5rem in px` converts to `24px`
- a same-unit target (`16px to px`) gives null
- storage matrix: `1 GB → 0.9313 GiB`, `1 GiB → 1.0737 GB`, `1536 B to KiB → 1.5 KiB`,
  `2 TB to GB → 2000 GB` (one cause: unit table)
- a bare byte count without a target and a negative storage value give null
- `#f00` and `#FF0000` both convert to `rgb(255, 0, 0)` with a lowercased `from`
- hex of length 4 or 8 gives null
- a 10-digit integer converts as Unix seconds and a 13-digit integer as Unix milliseconds to the same
  ISO UTC instant (`1700000000` and `1700000000000` → `2023-11-14T22:13:20.000Z`)
- an integer of 9 or 11 digits gives null
- an unrecognised conversion (`5 apples to pears`) gives null
- a sub-unit result keeps four significant digits (`1px to rem → 0.0625rem`)

`calculator-provider.test.ts`: `describe("createCalculatorProvider")`
- an un-prefixed compound expression emits one copy row whose value is the result and whose score is
  `EXACT_MATCH_SCORE`
- an un-prefixed lone number emits no row
- with the `=` prefix a lone operand emits a row
- an invalid expression emits no row and does not throw
- floating-point noise is rounded away (`0.1+0.2` copies `0.3`)
- the item id is `calc:result` whatever the query (comment: no query text in ids, per the sprint 1
  id contract)

`conversions-provider.test.ts`: `describe("createConversionsProvider")`
- a CSS conversion emits one copy row with the `to` value and the base in its description
- a storage, colour and timestamp input each emit one row whose id is `convert:<kind>` (matrix: one
  cause, kind → id)
- an unrecognised input emits no row

`collect-palette-items.test.ts` (existing): add
- with a prefix in the context only providers declaring that prefix contribute
- without a prefix a provider declaring one still contributes

`rank-palette-items.test.ts` (existing): add
- an item with a score override is kept although its label does not match the query
- a computed row at `EXACT_MATCH_SCORE` ranks above a lexical row whose label equals the query when
  it comes first in input order (comment: the "2025-5" coexistence rule)
- an item with a score override keeps its input position on a blank query

`command-palette.test.tsx` (existing, jsdom): add `vi.mock("sonner", …)` exposing `toast.success` /
`toast.error` as `vi.fn()` at the top with the other mocks. Stub `navigator.clipboard` per test with
`Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })`. Remove
it in an `afterEach` so no test leaks it (Rule 3.3). Type into the input with `fireEvent.change` on
the root placeholder.
- typing `2025-5` lists the calculator row first and a host provider row labelled `2025-5` second
  (host provider built inline, as in the existing test at L115)
- pressing Enter on the calculator row writes `2020` to the clipboard, closes the dialog and shows a
  success toast naming the value (await the toast with `vi.waitFor`)
- typing `=16px` shows no conversion row (the prefix routes to the calculator only)
- with no clipboard API, Enter on a computed row closes the dialog and shows the error toast

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

From the repo root unless stated:

- `npx tsc --noEmit -p apps/dashboard/tsconfig.app.json` (TypeScript 7; no output = pass)
- `pnpm beech lint`
- `node scripts/check-design-tokens.mjs --format agent apps/dashboard/src/features/command-palette/command-palette.tsx`
- `pnpm beech test --diff`. Exit 0 is required. It ignores untracked files (sprint 1 review, note 2),
  so also run, in `apps/dashboard`:
  `npx vitest run src/features/command-palette src/pages/palette-providers.test.ts src/test/cross-slice/app.test.tsx`
- `pnpm --filter @beechcms/dashboard build`
- Safety grep: `grep -rnE "\beval\(|new Function|Function\(" apps/dashboard/src/features/command-palette`
  returns nothing.
- VSA grep: `grep -rn "@/features/" apps/dashboard/src/features/command-palette --include=*.ts --include=*.tsx | grep -v "@/features/shared\|@/features/command-palette"`
  returns nothing.
- Graph re-check: `graphify update . --force`, then `graphify affected "createCalculatorProvider()" --depth 2`
  lists only files inside `features/command-palette`.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `PalettePrefix`, `PalettePerform`, the `score` / `prefix` additions, `ParsedPaletteQuery`,
      `PALETTE_PREFIXES`, `EXACT_MATCH_SCORE`, `EvaluatedExpression`, `Conversion`, `ConversionKind`,
      `REM_BASE_PX` and every exported signature match Section 4 verbatim.
- [ ] Every pre-existing provider, `src/pages/*` and the five existing context-building tests compile
      without edits.
- [ ] Prefixes are recognised only on the root page; with `=` only the calculator contributes.
- [ ] Without a prefix, the calculator, conversions and every other provider contribute together.
      `2025-5` lists the result row first and a matching lexical row right after it.
- [ ] A lone number un-prefixed produces no calculator row.
- [ ] Invalid, incomplete, ÷0 or non-finite input yields no row, no thrown error, no visible error.
- [ ] No `eval`, `Function` or other dynamic evaluation in the slice (grep clean).
- [ ] px ↔ rem uses `REM_BASE_PX = 16`, and the row says so. Storage keeps decimal and binary units
      apart. `#rgb`/`#rrggbb` → `rgb()`. 10/13-digit integers → ISO UTC. Unrecognised input yields no row.
- [ ] Conversions and timestamps depend only on the input (no clock, no network).
- [ ] Enter on a computed row copies the bare value, closes the palette and shows `toast.success`.
      A copy failure or a missing clipboard API shows `toast.error(common.copyFailed)`.
- [ ] Computed row ids are `calc:result` and `convert:<kind>`, with no query text.
- [ ] Idle (blank query) palette is identical to sprint 1's.
- [ ] Every new string is a `t()` key present in both `en.json` and `it.json`.
- [ ] `features/command-palette` imports no feature slice other than `@/features/shared`.
- [ ] Design-token check clean on `command-palette.tsx`; `_parts/palette-list.tsx` unchanged.
- [ ] `tsc`, lint, the explicit vitest run, `pnpm beech test --diff` and the dashboard build pass.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executor MUST NOT build or modify:
- `/` content prefix, search as a root provider, async lane, cancellation, row secondary actions,
  submenu, `search-results` removal → roadmap entry 4 `BeechPalContentSearch` (after entry 3
  `SearchResultMetadataApi`).
- `#` notes prefix and Quick Notes → entry 5 `BeechPalQuickNotes` (must keep a full hex literal such
  as `#ff0000` reaching the conversions provider; see the roadmap note).
- Context actions, `features/shared` declaration contract, confirm dialogs → entry 6
  `BeechPalContextActions`.
- `>` system commands, language / notification toggles, keyboard-shortcuts row, recent items
  → entry 7 `BeechPalSystemCommands`.
- `users.ui_prefs`, migrations, preference endpoints → entry 8 `UiPreferencesApi`. Pins → entry 9
  `BeechPalPins`. Computed rows are parametric, so entry 9 excludes them from pinning (brief §4).
- Currency conversion, a detail side panel, semantic search, any AI feature (brief §5, discarded).
- Calculator extras not specified here: `%`, decimal comma, implicit multiplication, functions
  (`sqrt`, `sin`), constants, result history, keeping the palette open after copy.
- Converter extras not specified here: alpha hex, rgb → hex, hsl, date → timestamp, bits, other CSS
  units (`em`, `pt`, `vw`), a configurable rem base.
- Changes to `_parts/palette-list.tsx`, `use-command-palette.ts`, `_parts/search-results-view.tsx`,
  the existing providers, `src/pages/*`, `App.tsx`, `config/dashboard-menu.ts`.
- Any file in `packages/` or `apps/api`.
