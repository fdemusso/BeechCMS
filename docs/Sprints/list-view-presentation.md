# Sprint Plan — List View Presentation Foundation (Frappe-inspired)

> Feature: upgrade the BeechCMS content **Table / List View** taking inspiration from the
> Frappe UI list, while staying inside the schema-driven model and Beech invariants.
> This document is **Sprint 01** of the feature. It is intentionally narrow: it builds the
> presentational foundation and ships the three *real* rendering gaps. Everything else the
> brief mentions is either already implemented or deferred (see Section 7).

---

## Pre-flight: Relational Mapping & VETO (summary)

**God Nodes affected (verified via graphify + reads):**

| Node | Path | Role |
|---|---|---|
| `ContentListPage` | `apps/dashboard/src/pages/content-list.tsx` | Orchestrator: state, data fetch, wires columns → `DataTable` |
| `generateColumns` | `apps/dashboard/src/lib/dynamic-columns.tsx` | Column factory (system + dynamic columns) |
| `DataTable` | `apps/dashboard/src/components/ui/data-table.tsx` | TanStack table, pagination, virtual-scroll grouping |
| Field registry | `apps/dashboard/src/features/fields/` (`FieldDisplay.tsx`, `registry.ts`, `display/*`) | Per-`BranchType` cell renderers |
| Content Toolbar | `apps/dashboard/src/features/content-toolbar/` | filter / sort / group / settings / search |

**Edges (data flow):** `useContentList` → `contentApi.fetchList` (`GET /api/content/:slug`) →
`ContentEntry[]` → `generateColumns(seed, …)` → `DataTable` → `FieldDisplay` → `display/<type>`.
The list response already primes relation labels into the TanStack cache
(`useContentList` effect + `ContentListWithMeta.relations`), so relation cells resolve **without N+1**.

**Architectural VETO findings (Ponytail / YAGNI):**

- 🔴 **VETO** — `_liked_by` "heart" favourite: Frappe-CRM-specific, no generic CMS need.
- 🔴 **VETO** — hardcoded "phone" column icon: would hardcode field names; violates the
  Botanical "no hardcoded field names" rule. There is no `phone` `BranchType`.
- 🟢 **ALREADY EXISTS — do not rebuild:** Rating stars & percentage bars (`display/number.tsx`
  via `numberOptions.control==='rating'` / `format==='percentage'`), Checkbox (`display/boolean.tsx`),
  Badges (status column + tag JSON), text truncation + reveal (`components/ui/expandable-cell.tsx`),
  column add/hide/reorder + page-length + sort + group + advanced filters + bulk actions
  (`features/content-toolbar/*`), row routing (double-click → `onRowDoubleClick`), Avatar /
  AvatarGroup / Badge / Tooltip primitives (`components/ui/*`).
- 🟢 **REAL GAPS (this sprint):** (1) relative "time ago" for system timestamps, (2) deterministic
  colored **status indicator dot**, (3) **relation cells rendered as avatars** (`_assign` / owner use case).

This sprint touches **only `apps/dashboard`**. No `@beechcms/core` change, no `apps/api` change,
no D1 migration, no middleware — the existing list contract already carries every field we need.

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

The feature brief asks the table to *"adapt data formatting dynamically based on column
type"*. BeechCMS already does this through a **field registry keyed by `BranchType`**
(`features/fields/registry.ts`). The correct, non-over-engineered way to deliver the
Frappe-style visuals is therefore **not** a table rewrite — it is to (a) add the two missing
pure presentational primitives and (b) extend the existing per-type renderers and the system
columns inside `generateColumns`.

This must come **first** because every later visual enhancement (resizable columns,
click-to-filter, density modes) depends on the cell-rendering layer being correct and
**generic**. If we shipped row-level chrome before fixing how a cell decides what it is, we
would bake field-name assumptions into the table and break the schema-driven contract.

**VSA adherence:** all new code lives in `components/ui/*` (shared, framework-level) and
`lib/dynamic-columns.tsx` / `features/fields/display/*` (the existing rendering slice). No
cross-feature imports are introduced; nothing reaches into another `features/*` slice.

**Botanical invariant adherence:** zero DB access. Cells render from the `ContentEntry`
payload the Botanical Engine already returns (`dbToApi` output). No `content_{slug}` query,
no hardcoded field names — column identity is always derived from `seed.branches[].alias`
and the system fields (`status`, `created_at`, `updated_at`) the API already exposes.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**Rendering pipeline (exact):**
`content-list.tsx` builds `columns` via `generateColumns(seed, handleEdit, handleDelete,
maxLengths, selectedIds, handleBulkDelete, dateGroupPrecision, t, handleBulkEdit)` and passes
them to `<DataTable …>`. `DataTable` uses `@tanstack/react-table` with `getRowId = row.id`,
controlled `manualPagination|manualSorting|manualFiltering`, and a `@tanstack/react-virtual`
path when `grouping.length > 0`. Shared row height: `ROW_HEIGHT_PX = 48`.

**`generateColumns` system columns today** (`lib/dynamic-columns.tsx`):
`select` (checkbox) → `id` (hidden) → `slug` (hidden) → `status` (Badge, variant via
`getStatusBadgeVariant` string-hash) → …dynamic branch columns… → `actions` (dropdown).
There is **no `created_at` / `updated_at` column** even though the data carries both.

**`ContentEntry` (source of truth, `lib/dynamic-columns.tsx`):**
```ts
export interface ContentEntry {
  id: string
  schema_slug: string
  slug: string | null
  status: string
  has_pending_draft?: boolean
  data: Record<string, unknown>
  created_at: number | null   // ← present, currently unused in the table
  updated_at: number | null   // ← present, currently unused in the table
}
```

**Field registry (`features/fields/registry.ts`):** `registerDisplay` for
`text|number|boolean|date|json|richtext|file(MediaDisplay)|relation|repeater`; fallback
`DefaultDisplay`. `FieldDisplay` applies `resolvePolicies(branch).visibility`
(`hidden`→null, `masked`→`••••`) before delegating. `FieldDisplayProps`:
```ts
interface FieldDisplayProps {
  readonly branch: Branch
  readonly value: unknown
  readonly options?: { readonly maxLength?: number }
}
```

**Relation rendering (`display/relation.tsx`):** single → text `<button>`; multiple →
row of `<Badge>` chips. Labels resolve from the TanStack cache primed by `useContentList`
(`labelAlias = targetSeed.displayNameAlias ?? "title"`). No avatar today.

**Existing primitives (`components/ui/`):** `avatar.tsx` exports `Avatar`, `AvatarImage`,
`AvatarFallback`, `AvatarGroup`, `AvatarGroupCount`, `AvatarBadge`; `badge.tsx`;
`tooltip.tsx` (`Tooltip/TooltipTrigger/TooltipContent/TooltipProvider`);
`expandable-cell.tsx`. **No** relative-time or indicator-dot primitive exists.

**Core types (`packages/core/src/types.ts`):**
`BranchType = 'text'|'number'|'boolean'|'json'|'date'|'richtext'|'file'|'tags'|'relation'|'repeater'`.
`Seed.displayNameAlias` is mandatory. `Branch.format`, `Branch.numberOptions`,
`Branch.options`, `Branch.targetSeed`, `Branch.multiple` exist. **There is no `phone`,
`currency`, `rating`, or `duration` `BranchType`** — those Frappe concepts map onto existing
types (`number` + `numberOptions`, `text`) and must not become new system columns.

**i18n:** `apps/dashboard/src/locales/{en,it}.json`. Table strings live under `content.table.*`.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

Exact files produced (P) or modified (M). **No core/api/D1 files.**

1. **(P)** `apps/dashboard/src/components/ui/relative-time.tsx` — pure "time ago" + exact-date tooltip.
2. **(P)** `apps/dashboard/src/components/ui/indicator-icon.tsx` — colored status dot (tone-driven).
3. **(P)** `apps/dashboard/src/lib/status-tone.ts` — deterministic `status → tone` map (extracted/replaces the hash logic).
4. **(M)** `apps/dashboard/src/lib/dynamic-columns.tsx` —
   - status column: render `IndicatorIcon` + label (keep pending-draft badge);
   - add system columns `updated_at` (visible) and `created_at` (hidden by default) using `RelativeTime`.
5. **(M)** `apps/dashboard/src/features/fields/display/relation.tsx` — avatar (single) + `AvatarGroup` (multiple) rendering with initials fallback; text label kept as accessible name / tooltip.
6. **(M)** `apps/dashboard/src/pages/content-list.tsx` — add `created_at` to `initialHiddenColumns` / default `columnVisibility`.
7. **(P)** `apps/dashboard/src/test/lib/status-tone.test.ts` and **(P)** `apps/dashboard/src/test/ui/relative-time.test.tsx` — unit tests for the two pure modules.
8. **(M)** `apps/dashboard/src/locales/en.json` + `it.json` — add `content.table.created`, `content.table.updated` keys.

**Excluded from this sprint (stub/none):** no changes to `DataTable` internals (no column
resizing yet), no toolbar changes, no API/contract changes.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

**No D1 migration required** (frontend-only sprint; the engine already returns `status`,
`created_at`, `updated_at`). **No middleware registration changes** (no new `apps/api` route).

### 4.1 `lib/status-tone.ts` (new)

```ts
// SPDX-License-Identifier: BUSL-1.1
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info"

/** Deterministic, content-agnostic status → tone. Replaces the string-hash Badge variant. */
export function getStatusTone(status: string): StatusTone {
  const s = status.trim().toLowerCase()
  if (!s) return "neutral"
  if (["error", "failed", "rejected", "archived", "lost"].includes(s)) return "danger"
  if (["published", "active", "approved", "online", "won"].includes(s)) return "success"
  if (["draft", "pending", "qualification", "negotiation"].includes(s)) return "warning"
  if (["new", "info", "demo", "proposal"].includes(s)) return "info"
  return "neutral"
}

export const STATUS_TONE_DOT_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger:  "bg-red-500",
  info:    "bg-sky-500",
}
```

### 4.2 `components/ui/indicator-icon.tsx` (new)

```tsx
// SPDX-License-Identifier: BUSL-1.1
import { cn } from "@/lib/utils"

export interface IndicatorIconProps {
  className?: string
  /** Tailwind bg-* class for the dot (see STATUS_TONE_DOT_CLASS). */
  colorClassName: string
  "aria-label"?: string
}

export function IndicatorIcon({ className, colorClassName, ...rest }: IndicatorIconProps) {
  return (
    <span
      role="img"
      className={cn("inline-block size-2 shrink-0 rounded-full", colorClassName, className)}
      {...rest}
    />
  )
}
```

### 4.3 `components/ui/relative-time.tsx` (new)

Uses `Intl.RelativeTimeFormat`; locale derived from `i18next` so `it`/`en` both work
(matches `DateDisplay` which already uses `it-IT`). Tooltip reveals the absolute datetime.

```tsx
// SPDX-License-Identifier: BUSL-1.1
import * as React from "react"
import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export interface RelativeTimeProps {
  /** Epoch ms (BeechCMS stores created_at/updated_at as number|null). */
  value: number | null | undefined
  className?: string
}

const DIVISIONS: { amount: number; unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: "second" }, { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },   { amount: 7,  unit: "day" },
  { amount: 4.34524, unit: "week" }, { amount: 12, unit: "month" },
  { amount: Number.POSITIVE_INFINITY, unit: "year" },
]

function formatRelative(from: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  let duration = (from - Date.now()) / 1000
  for (const div of DIVISIONS) {
    if (Math.abs(duration) < div.amount) return rtf.format(Math.round(duration), div.unit)
    duration /= div.amount
  }
  return rtf.format(Math.round(duration), "year")
}

export function RelativeTime({ value, className }: RelativeTimeProps) {
  const { i18n } = useTranslation()
  if (value == null) return <span className="text-muted-foreground">—</span>
  const locale = i18n.language || "en"
  const rel = formatRelative(value, locale)
  const abs = new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{rel}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{abs}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
```

### 4.4 `lib/dynamic-columns.tsx` (modify)

- Add imports: `IndicatorIcon`, `getStatusTone`, `STATUS_TONE_DOT_CLASS`, `RelativeTime`.
- **Replace** the `status` cell body (delete `getStatusBadgeVariant`):
```tsx
cell: ({ row }) => {
  const status = (row.original.status ?? "").trim() || "—"
  const tone = getStatusTone(status)
  const hasPendingDraft = shouldShowPendingDraftBadge(row.original.status, row.original.has_pending_draft)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5">
        <IndicatorIcon colorClassName={STATUS_TONE_DOT_CLASS[tone]} aria-label={status} />
        <span className="text-sm">{status}</span>
      </span>
      {hasPendingDraft && (
        <Badge variant="outline" className={`text-xs ${pendingDraftBadgeClass}`}>
          {t("content.table.pendingDraft")}
        </Badge>
      )}
    </div>
  )
},
```
- **Append two system columns** to `fixedColumns` (placed after `status`, before dynamic columns):
```tsx
{
  id: "updated_at",
  accessorFn: (row) => row.updated_at,
  header: t("content.table.updated"),
  cell: ({ row }) => <RelativeTime value={row.original.updated_at} className="text-sm text-muted-foreground" />,
  enableSorting: false,
},
{
  id: "created_at",
  accessorFn: (row) => row.created_at,
  header: t("content.table.created"),
  cell: ({ row }) => <RelativeTime value={row.original.created_at} className="text-sm text-muted-foreground" />,
  enableSorting: false,
},
```
> `enableSorting:false` because list sorting is server-side (`manualSorting`) keyed on
> branch aliases; wiring timestamp sort to the API is a separate, deferred task.

### 4.5 `display/relation.tsx` (modify)

Render an `Avatar` with **initials fallback** derived from the resolved label; keep the click
→ `EntryEditorDialog` behaviour and the text label as accessible name / tooltip. Multiple →
`AvatarGroup` capped at 3 with `AvatarGroupCount` overflow. No new network calls — reuse the
already-resolved `label` (cache primed by `useContentList`). Helper:
```ts
function initialsOf(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase()
}
```
Single value → `<Avatar size="sm"><AvatarFallback>{initials}</AvatarFallback></Avatar>` next to
the existing label button. Multiple → wrap chips' avatars in `<AvatarGroup>`; show first 3,
then `<AvatarGroupCount>+{n-3}</AvatarGroupCount>`.
> Avatar **images** require the target seed to expose an image branch; out of scope here —
> initials-only is the deterministic, schema-agnostic baseline.

### 4.6 `content-list.tsx` (modify)

Add `"created_at"` to both the initial `columnVisibility` state object and the
`initialHiddenColumns` memo (alongside `id`, `slug`, metadata aliases) so `created_at` ships
hidden-by-default and `updated_at` ships visible.

### 4.7 i18n keys

`en.json`: `"created": "Created"`, `"updated": "Last modified"` under `content.table`.
`it.json`: `"created": "Creato"`, `"updated": "Ultima modifica"` under `content.table`.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

Run from the repo root unless noted.

```bash
# 1. Type safety (whole workspace, Turborepo)
pnpm run type-check
#    or scoped: cd apps/dashboard && pnpm run type-check   # tsc -b

# 2. Lint (must be clean — no new eslint-disable)
pnpm run lint
#    or scoped: cd apps/dashboard && pnpm run lint

# 3. Unit tests (Vitest) — includes new status-tone & relative-time specs
cd apps/dashboard && pnpm run test
#    targeted: pnpm run test -- status-tone relative-time dynamic-columns

# 4. Production build of the dashboard bundle
cd apps/dashboard && pnpm run build      # vite build

# 5. Manual smoke (dev): start the stack and open a content list
pnpm run dev
#    → verify: status dot color, "Last modified" relative time + hover tooltip,
#      relation column shows avatar initials (single) / AvatarGroup (multiple),
#      created_at hidden by default but toggleable in Settings → Columns.
```
> No `pnpm run db:reset:local` needed — this sprint introduces no schema change.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

- [ ] `pnpm run type-check` passes with **zero** errors; no `@ts-ignore`/`@ts-expect-error` added.
- [ ] `pnpm run lint` passes with **zero** new warnings; no new `eslint-disable`.
- [ ] `apps/dashboard` Vitest suite green, including new `status-tone.test.ts` and `relative-time.test.tsx`.
- [ ] `cd apps/dashboard && pnpm run build` succeeds.
- [ ] **No file changed** under `packages/core/**`, `apps/api/**`, or `migrations/**`
      (frontend-only sprint; Botanical invariant preserved).
- [ ] No hardcoded content field names: status/relation/timestamp rendering derives identity
      only from `branch.alias`, `seed.displayNameAlias`, and system fields.
- [ ] New primitives (`RelativeTime`, `IndicatorIcon`) live in `components/ui/` and import
      **no** `features/*` module (zero cross-slice dependency).
- [ ] Relation avatar rendering issues **no** additional network requests beyond the existing
      `useContentList` cache priming (verified in Network tab).
- [ ] Status column keeps the pending-draft badge behaviour and the accessible status text.
- [ ] `updated_at` column visible by default; `created_at` hidden by default and toggleable.
- [ ] `it.json` and `en.json` both contain `content.table.created` and `content.table.updated`.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build the following in this sprint:

- **`DataTable` internals / resizable columns** — TanStack `columnResizing` is real table infra;
  it is its own follow-up sprint (*"Sprint 02 — Column Resizing & Density"*). Do not touch
  `data-table.tsx` here.
- **Click-to-filter (`applyFilter`) on cell values** — deferred (*"Sprint 03 — In-cell quick filter"*).
  The filter DSL already exists; wiring cell clicks is a separate concern.
- **Single-click row routing / Load-More pagination** — current double-click routing and
  numbered server-side pagination stay; do not add a second pagination paradigm (YAGNI).
- **Avatar *images*** for relations (needs a target-seed image-branch convention) — initials only.
- 🔴 **VETOED, do not implement:** `_liked_by` heart/favourites; hardcoded phone-number column
  icon; any new `BranchType` (`phone`/`currency`/`duration`).
- **Already implemented — do not reimplement:** rating stars & percentage bars (`display/number.tsx`),
  checkbox (`display/boolean.tsx`), tag/status badges, text truncation+reveal (`expandable-cell.tsx`),
  column add/hide/reorder, page-length, sort, group-by, advanced filters, bulk actions, search.
- **Any `@beechcms/core` / `apps/api` / D1 change** — including timestamp server-side sorting
  (would require touching the list handler; track separately if product wants sortable dates).
