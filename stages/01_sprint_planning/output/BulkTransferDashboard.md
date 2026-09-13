# Sprint Plan — `BulkTransferDashboard`

Feature: Bulk Data Transfer (Export / Import) — Sprint 4 of 4, the last.
Roadmap: `output/backlog/ROADMAP.md`.
Previous sprints: `docs/Sprints/BulkTransferCorePrimitives/` (merged, PASS),
`docs/Sprints/ContentExportStream/` (merged, PASS), `docs/Sprints/ContentImportJobs/` (merged,
commit `81a8d7d`).

This sprint adds **zero backend code**. Both endpoint surfaces it consumes are merged and stable;
S4 is the UI tier that makes them reachable by a human.

---

### Pre-Computation Analysis

#### a) God Nodes identified via the CLI

| Node | ID | Degree | Why it matters here |
|---|---|---|---|
| `ContentToolbar()` | `apps_dashboard_src_features_content_toolbar_content_toolbar_contenttoolbar` | **8** | `content-toolbar/content-toolbar.tsx:L24`. The host of every list-level action. Consumed by **two** pages — `pages/content-list.tsx:L22` and `pages/drafts-list.tsx:L44` — so any prop added here must be optional or both call sites break. It calls `usePermissions()` (L29) already, which is where the export/import gates go. |
| `useContentListModals()` | `apps_dashboard_src_features_content_management_hooks_use_content_list_modals_usecontentlistmodals` | **4** | `content-management/hooks/use-content-list-modals.ts:L10`. Single owner of every list dialog's open/close state (`bulkEditOpen`, `automationPanelOpen`, `cardConfigOpen`). The import wizard's `open` state belongs here and nowhere else. |
| `ContentListModals()` | `apps_dashboard_src_features_content_management_components_ContentListModals_contentlistmodals` | **2** | `content-management/components/ContentListModals.tsx`. The dialog composition root: it already imports `EntryEditorDialog`, `ContentDeleteDialog`, `BulkEditDialog`, `CardConfigDialog` and `AutomationPanel` from five sibling barrels. The import wizard mounts here, by the same rule. |
| `uploadFile()` | `apps_dashboard_src_lib_upload_uploadfile` | **7** | `lib/upload.ts:L8`. The existing presign→PUT→confirm helper, consumed by `fields/edit/media.tsx`, `richtext-editor` and `settings.api.ts`. **Deliberately NOT reused** — see VETO Audit §5. |
| `EntryEditorDialog()` | `apps_dashboard_src_features_entry_editor_entry_editor_dialog_entryeditordialog` | **6** | The shape every list dialog copies: a named export from the slice barrel, mounted by `ContentListModals.tsx:L6`, state owned upstream. The import wizard is built to this template, not to a new one. |

`graphify explain "api"` and `graphify explain "Seed"` return **Ambiguous** (the graph indexes
`docs/api/**` typedoc Markdown alongside source) — resolved by reading
`apps/dashboard/src/lib/api.ts` directly, per the tool's own decision heuristic. There is no node
for `isFlatSeed` reachable from `apps/dashboard`: the `@beechcms/core` barrel terminates reverse
traversal, a blind spot documented in S1, S2 and S3 and again irrelevant here because S4 changes
zero core files.

#### b) Architectural boundaries affected

| Package | Touched in S4? | Exactly what |
|---|---|---|
| `@beechcms/core` | **NO** | Zero files. S4 *consumes* `isFlatSeed`, `nonFlatBranches`, `checkFormatCompatibility`, `TRANSFER_FORMATS` and the `TransferFormat` type from the barrel — all shipped in S1 and already exported (`packages/core/src/index.ts:L71` re-exports `./transfer/index.js`). If the executing agent finds itself editing `packages/core/`, it has gone off-plan. |
| `apps/api` | **NO** | Zero files. Both endpoints shipped in S2 (`GET /api/content/:slug/export`) and S3 (`POST /api/content/:slug/import`, `GET /api/content/import-jobs/:id`). No route, no migration, no permission row. If the executing agent finds itself editing `apps/api/`, it has gone off-plan. |
| `apps/dashboard` | **YES — one new slice, three modified slices, one page, one router row, two locale files** | New slice `features/content-transfer/`. Modified: `features/shared/view-registry.ts` (one union member), `features/content-toolbar/` (one new presentational component + two optional props + one render line + two const-array entries), `features/content-gallery/index.ts` and `features/content-kanban/index.ts` (one array entry each), `features/content-management/` (modal state + mount), `pages/content-list.tsx` (wiring), new `pages/import-job-detail.tsx`, `App.tsx` (one route). |
| `docs/` | **NO** | The endpoint reference was written by S2 and S3. Nothing about the UI belongs in `docs/reference/internal-content.md`. |

**Vertical Slice boundaries.** The new `content-transfer` slice imports from `@beechcms/core`,
from `@/lib/api`, from `@/components/ui/**` and from `@/features/shared/hooks/use-permissions` —
repo-wide infrastructure, not slices. It imports **nothing** from `content-management`,
`content-toolbar`, `content-gallery`, `content-kanban`, `bulk-edit`, `entry-editor` or any other
sibling. The dependency runs one way only: the composition roots (`ContentListModals.tsx`,
`pages/content-list.tsx`, `App.tsx`) import *into* it.

The `TransferFormat` union crosses the toolbar/transfer boundary. It is imported by **both** sides
from `@beechcms/core`, never re-exported from one slice to the other — that is the mechanism that
keeps `content-toolbar` free of a `content-transfer` import while both speak the same vocabulary.

#### c) `graphify affected` impact analysis

```
$ graphify affected "ContentToolbar" --depth 2
- content-toolbar.test.tsx      [imports]      apps/dashboard/src/features/content-toolbar/test/unit/content-toolbar.test.tsx:L51
- content-list.tsx              [imports]      apps/dashboard/src/pages/content-list.tsx:L22
- drafts-list.tsx               [imports]      apps/dashboard/src/pages/drafts-list.tsx:L44
- automation-panel.test.tsx     [imports]      apps/dashboard/src/test/cross-slice/automation-panel.test.tsx:L5
- content-toolbar/index.ts      [re_exports]   apps/dashboard/src/features/content-toolbar/index.ts:L13
- App.tsx                       [imports_from] apps/dashboard/src/App.tsx:L9
- use-content-list-query.ts     [imports_from] apps/dashboard/src/features/content-management/hooks/use-content-list-query.ts:L10
- use-content-table-config.ts   [imports_from] apps/dashboard/src/features/content-management/hooks/use-content-table-config.ts:L12
- barrels.test.ts               [imports_from] apps/dashboard/src/test/cross-slice/barrels.test.ts:L12
- content-list.test.tsx         [dynamic_import] apps/dashboard/src/test/cross-slice/content-list.test.tsx:L1

$ graphify affected "ContentListModals" --depth 2
- content-list.tsx [imports]      apps/dashboard/src/pages/content-list.tsx:L26
- App.tsx          [imports_from] apps/dashboard/src/App.tsx:L9

$ graphify explain "useContentListModals"
  degree 4; <-- content-list.tsx:L26, ContentListPage():L48; --> useDeleteContent():L53

$ graphify explain "uploadFile"
  degree 7; <-- fields/edit/media.tsx:L15,L192, settings.api.ts:L6,
  richtext-editor/components/RichtextEditor.tsx:L9,L29, settings.api.test.ts:L28

$ graphify path "ContentToolbar" "uploadFile"
No directed path found between 'ContentToolbar' and 'uploadFile'.

$ graphify path "ContentKanban" "BulkEditDialog"
No directed path found between 'ContentKanban' and 'BulkEditDialog'.
```

**Reading of the result, including its blind spots — all closed by direct inspection.**

1. **`ContentToolbar` has two page consumers, not one.** `drafts-list.tsx:L44` renders the same
   toolbar over the *global drafts* list, where there is no single seed to export. Both new props
   (`onExport`, `onOpenImport`) are therefore **optional**, and the new `transfer` tool renders only
   when both a handler and the tool id are present. `drafts-list.tsx` is not modified by this sprint
   and must keep compiling untouched — that is an acceptance criterion, not a hope.

2. **`affected "ContentToolbar"` lists `barrels.test.ts`.** `apps/dashboard/src/test/cross-slice/barrels.test.ts:L12`
   asserts that each slice barrel exposes its principal symbols (`ContentToolbarIndex.ContentToolbar`,
   `ContentToolbarIndex.DEFAULT_ENABLED_TOOLS`). The new slice gets a row there; a barrel with no
   assertion is a barrel nobody notices breaking.

3. **`path "ContentKanban" "BulkEditDialog"` → no path** is the VSA baseline being re-measured:
   sibling leaf slices do not reach each other today. After S4 the same query against
   `content-toolbar` → `content-transfer` must also return no path. Stated as an acceptance
   criterion below.

4. **The graph cannot see React Router's ranking algorithm.** `App.tsx:L215` registers
   `/content/:slug/:id`, which *textually* matches `/content/import-jobs/<uuid>`. React Router v6's
   `createBrowserRouter` ranks static segments above dynamic ones, so `/content/import-jobs/:jobId`
   wins regardless of array order — but this is precisely the swallower class that S3 had to solve
   by hand in `PROTECTED_ROUTES`, and it is verified by a rendered-route test, not by reasoning.

5. **The graph cannot see HTTP contracts.** The two consumed endpoint shapes were read from the
   merged S3 sources and its archived plan, not inferred:
   `POST /api/content/:slug/import` takes `{ objectKey, format }` and answers
   `202 { jobId }` + `Location: /api/content/import-jobs/<jobId>`;
   `GET /api/content/import-jobs/:id` answers
   `{ id, targetSeed, format, state, rowsRead, insertedRows, failedRows, errors[], createdAt, updatedAt, finishedAt }`
   and **never** returns `objectKey` or `createdBy`.

**New leaf code has no reverse edges.** Every file under `features/content-transfer/` and
`pages/import-job-detail.tsx` is new; nothing can break from them.

---

### VETO Audit

Proposed boundaries evaluated against `_config/ponytail_arch.md`.

**1. THE BOTANICAL INVARIANT — does anything bypass `@beechcms/core`?**

No D1 access exists in this tier at all: the dashboard is a browser bundle talking HTTP. The
invariant applies here in its second form — **no hardcoded field names, no re-implemented engine
logic**:

- The CSV-vs-NDJSON decision is **not** re-derived in the browser. The toolbar calls
  `isFlatSeed(seed)` / `nonFlatBranches(seed)` from `@beechcms/core` — the same authority
  `exportHandler` and `importHandler` call through `checkFormatCompatibility`. A second client-side
  rule ("does the seed have a relation branch?") would be exactly the drift this invariant exists to
  prevent, and it would disagree with the server the first time a branch type is added.
- The job report is rendered from the endpoint's response fields, not from the `import_jobs` seed's
  branch aliases. The dashboard never learns that `rowsRead` is stored as `row_offset` under
  `br_05`; `toImportJobResponse` (S3) owns that mapping and is the only place it exists.
- The client sends no `status` and no branch alias anywhere. It sends `objectKey` and `format`.

**PASS.**

**2. VSA ENFORCEMENT — cross-feature imports.**

Zero new slice-to-slice edges in the leaf direction, verified before and after:
`graphify path "ContentToolbar" "uploadFile"` → no path;
`graphify path "ContentKanban" "BulkEditDialog"` → no path.

Three composition roots import the new slice, each of which is already a composition root today:

- `ContentListModals.tsx` — already imports five sibling barrels (`entry-editor`,
  `content-delete-dialog`, `bulk-edit`, `content-kanban`, `automations`). Adding a sixth changes
  nothing structurally.
- `pages/content-list.tsx` — already imports six barrels (`navigation`, `content-gallery`,
  `content-kanban`, `content-toolbar`, `content-management`, `schema`). Pages live outside
  `features/` and are the composition tier by construction.
- `App.tsx` — the router.

**The one genuine VSA question, and its answer.** Should the export dropdown live in
`content-transfer` and be injected into the toolbar through its existing `children` slot, instead of
being a `content-toolbar` component driven by props? **No.** The toolbar owns its own layout, its
own `isToolEnabled` gate and its own tooltip idiom; every other tool (`SearchBar`, `SettingsMenu`,
`ViewSwitcher`, the automation button) is a `toolbar-components/*` file that calls a prop. A slot
injection would make the toolbar's rendering order depend on its caller, which no current tool does.
`TransferMenu` is presentational — it holds no API call, no query, no job state — and the side
effects it triggers are supplied by the page. **PASS.**

**3. REJECTED reuse #1 — calling `uploadFile()` from `lib/upload.ts`.**

`uploadFile` does presign → PUT → **`POST /upload/confirm`** and returns a public media URL
(`lib/upload.ts:L8-L24`). `/upload/confirm` writes a row into the **media registry**
(`features/upload/index.ts:L176` → `mediaRepository`), which is how an asset becomes visible in the
Media Library. An import file is a throwaway transport object that the chunk worker **deletes** on a
terminal job state (S3, brief §2) — registering it as a media asset would leave a permanent library
row pointing at an object that no longer exists. `uploadFile` also returns the *URL*, while
`POST /api/content/:slug/import` requires the *key*.

**Rejected**, and the alternative is not a change to `lib/upload.ts` either: widening the shared
helper with a `{ confirm: false }` flag would alter a function three slices already depend on, to
serve one caller. `content-transfer` gets its own ~15-line `presignImportObject()`. If a second
slice ever needs a confirm-less upload, *that* is when it moves to `lib/`. **PASS (YAGNI).**

**4. REJECTED reuse #2 — a client-side file-size pre-check.**

The obvious nicety is refusing a >50 MB file before uploading it. The constant is
`DEFAULT_IMPORT_MAX_BYTES` in `apps/api/src/features/content/constants.ts:L34` — **not** in
`@beechcms/core`, and `apps/dashboard` does not and must not depend on `apps/api`. Copying the
number into the bundle creates a second source of truth that silently drifts the moment
`IMPORT_MAX_BYTES` is set on a deployment (the binding S3 added). **Rejected**: the wizard uploads,
then surfaces the server's `413 content-import-file-too-large` verbatim, including the server's own
`expected`/`received` byte figures. One authority, one message. **PASS.**

**5. The `application/x-ndjson` question, already settled by S3, restated because S4 is the caller.**

`POST /api/upload/presign` gates on `isMimeAccepted(mimeType, 'any')` and the media allowlist has
no `application/x-ndjson` (S3 VETO Audit §6, which rejected adding it). The wizard therefore sends
`mimeType: "application/json"` for an NDJSON file and `"text/csv"` for a CSV file — **derived from
the format the user picked, never from `file.type`**, which the browser reports as `""` for a
`.ndjson` file. This is sound because the stored content type is not authoritative: `importHandler`
reads `format` from the request body and never reads `head.contentType`. **PASS — no core change.**

**6. CLOUDFLARE PURITY.**

No new npm dependency. No CSV or NDJSON parsing in the browser: the file is uploaded as opaque bytes
and every row is parsed, validated and counted by the S1 codecs running inside the Worker. Polling
is a `refetchInterval` on an existing TanStack Query client (v5.90, already a dependency), not a
WebSocket, not a Durable Object, not an SSE endpoint — none of which exist for this feature and none
of which are worth inventing for a progress bar that updates every two seconds. **PASS.**

**7. Two accepted limitations, stated rather than hidden.**

- **The presign global-scope gap (S3's explicitly deferred item).** `POST /api/upload/presign`
  demands `content:create` at `GLOBAL_SCOPE`. A user holding write scope on a single seed passes the
  toolbar's own gate (`can("content:create", slug)`), sees the Import entry, and then receives
  **403 on the presign step**. Fixing that is an `upload`-slice route-rule change with its own blast
  radius across media uploads — it is a roadmap item, not S4 work. What S4 **must** do is stop the
  failure from reading as a generic error: `usePermissions().canGlobally("content:create")` is
  checked before the upload starts, and a caller who lacks it gets an explicit, actionable message
  instead of a stack of red toast. Hiding the Import entry entirely from such a user is rejected —
  it would make a permission gap look like a missing feature.
- **No job cancellation and no job list.** Neither endpoint exists (S3 shipped exactly two routes
  plus the generic seed CRUD). The wizard cannot cancel, and a colleague reaches a job only by its
  URL. The job-detail *route* exists precisely so that URL is shareable — which is the brief's team
  visibility rule (§2) expressed in the UI tier, with the real enforcement staying in
  `import-job-status.ts` where S3 put it.

**8. Scope gate.** S4 is one sprint: one new slice, no backend, no migration, no core change. It is
the terminal roadmap entry; nothing is deferred to an S5 except the two items in §7, which already
have roadmap homes.

**Verdict: APPROVED.** Proceeding to the linear Sprint Plan.

---

==========================================================================
SECTION 1 — WHY THIS SPRINT EXISTS FIRST
==========================================================================

S4 exists **last**, and that ordering is the point of the four-sprint split: it is the only sprint
whose entire deliverable is disposable. A dashboard component can be rewritten in an afternoon; the
D1 migration S3 shipped cannot be un-applied. Putting the UI in the same merge as an irreversible
artifact would have coupled a cheap decision to an expensive one.

It exists **now** because its two preconditions are both satisfied and neither was before:

1. **Both endpoint surfaces are merged and stable.** S2 settled the export contract (row order,
   the `413` cap, the three response headers) and S3 settled the import contract (`202 { jobId }` +
   `Location`, the four job states, the capped error report, the creator-or-same-seed-write-scope
   read rule). S4 adds no endpoint and negotiates no contract — it types the two that exist and
   calls them. Building the wizard against an unmerged endpoint would have meant debugging a cursor
   through a browser, which S3's plan named as the specific thing to avoid.

2. **The asynchrony is already proven.** S3's integration suite drove a multi-chunk import to
   `completed` through the real queue dispatcher. S4 therefore polls a mechanism that is known to
   converge; if a job hangs, the defect is upstream and visible in the job record, not in the
   polling hook.

**Botanical adherence.** The dashboard re-derives no engine knowledge. `isFlatSeed` and
`nonFlatBranches` come from `@beechcms/core` — the same functions `checkFormatCompatibility` wraps
on the server — so the CSV option is disabled for exactly the seeds the API would refuse, with the
offending branch aliases named in the explanation because core hands them over. The job report is
rendered from the endpoint's wire shape; the `br_XX` ids and column names of `content_import_jobs`
never reach the browser.

**VSA adherence.** One new leaf slice, `content-transfer`, with zero sibling imports. Every
cross-slice edge is introduced by a composition root that already plays that role
(`ContentListModals.tsx`, `pages/content-list.tsx`, `App.tsx`). The shared vocabulary between
`content-toolbar` and `content-transfer` is the `TransferFormat` type, imported by both from
`@beechcms/core` — the rule-3 remedy applied in advance rather than after a collision.

==========================================================================
SECTION 2 — CURRENT STATE (verified via graphify)
==========================================================================

**The two endpoints S4 consumes (merged; read from source, not assumed)**

```
GET  /api/content/:slug/export?format=csv|ndjson
  200  streamed body
       Content-Type: text/csv | application/x-ndjson
       Content-Disposition: attachment; filename="<slug>.<csv|ndjson>"
       Cache-Control: no-store
  400  content-invalid-export-format        unknown format value
  400  content-csv-requires-flat-seed       errors[] carries one entry per offending branch
  403  permission                           caller lacks content:read on <slug>
  404  content-seed-not-found
  413  content-export-too-large             refused before the first byte (EXPORT_MAX_ROWS, default 50 000)

POST /api/content/:slug/import              body { objectKey: string, format: "csv"|"ndjson" }
  202  { jobId }                            + Location: /api/content/import-jobs/<jobId>
  400  content-import-object-key-required
  400  content-invalid-import-format
  400  content-csv-requires-flat-seed
  403  permission                           caller lacks content:create on <slug>
  404  content-seed-not-found | content-import-object-not-found
  413  content-import-file-too-large        errors[0].expected / .received carry the byte figures
  500  content-import-jobs-seed-missing | content-database-error

GET  /api/content/import-jobs/:id
  200  { id, targetSeed, format, state, rowsRead, insertedRows, failedRows,
         errors: Array<{ row, code, message, field? }>,
         createdAt, updatedAt, finishedAt }
       state: "pending" | "processing" | "completed" | "failed"
       objectKey and createdBy are deliberately absent — that omission is a contract (S3)
  403  caller is neither the creator nor a holder of content:create on targetSeed
  404  unknown job id
```

Error bodies are RFC 7807 `application/problem+json`: `{ type, title, status, detail, errors? }`,
where `type` is the machine-readable identity (`content-csv-requires-flat-seed`, …) and `detail` is
the human string. Per `testing_conventions.md` §5.4, tests assert `type`, never `detail`.

**The upload transport (unchanged, consumed from the caller's side only)**

```
POST /api/upload/presign  { filename, mimeType, sizeBytes }
  -> 200 { uploadUrl, key, expiresIn }        (features/upload/index.ts:L149-L172)
  -> 501 presigned_urls_require_s3_credentials  when the bucket has no S3 credentials
  gate: content:create at GLOBAL_SCOPE  ← the S3-deferred limitation
PUT  <uploadUrl>  (direct to R2/S3, not through the Worker; Content-Type must match the presign)
```

`POST /upload/confirm` exists and is **not** part of this flow (VETO Audit §3).

**HTTP client — `apps/dashboard/src/lib/api.ts`**

```ts
export const api = axios.create({
  baseURL: '/api',
  timeout: 30_000,                       // ← relevant: a 50 000-row export can exceed this
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})
// request interceptor attaches `Authorization: Bearer <in-memory token>`
```

Paths passed to `api.*` are therefore **without** the `/api` prefix: `/content/${slug}/export`.

**Toolbar tool registry — the gate every toolbar control passes through**

```ts
// features/shared/view-registry.ts:L7
export type ToolbarTool = 'filter' | 'sort' | 'automation' | 'search' | 'settings' | 'create'

// features/content-toolbar/shared.ts
export const DEFAULT_ENABLED_TOOLS: ToolbarTool[] = ['filter','sort','automation','search','settings','create']

// features/content-toolbar/view-registry.bootstrap.ts — header: "the ONLY module allowed to
// import from multiple content slices"
viewRegistry.register({ type: 'table',  labelKey: 'content.list.table',  enabledTools: [...] })
registerContentGalleryView(viewRegistry)   // features/content-gallery/index.ts
registerContentKanbanView(viewRegistry)    // features/content-kanban/index.ts — ['filter','search','settings','create']

// features/content-toolbar/use-content-toolbar.ts:L85
const isToolEnabled = (tool: string) => enabledTools.includes(tool as any)
```

Render idiom in `content-toolbar.tsx` (L157+): every tool is
`{isToolEnabled('<id>') && <SomeComponent …props />}` inside the right-hand
`<div className="flex shrink-0 items-center gap-2">`.

**Permissions — `features/shared/hooks/use-permissions.ts`**

```ts
const { can, canGlobally } = usePermissions()
can('content:read',  seed.slug)     // per-seed, additive scope model, evaluated by core's hasPermission
canGlobally('content:create')       // held at '*' — mirrors a perm(x,'global') row in PROTECTED_ROUTES
```

`ContentToolbar` already calls `usePermissions()` at `content-toolbar.tsx:L29` for `canCreate`.
Client-side hiding is cosmetic; the server gate stays the enforcement point.

**Dialog composition — the template to copy**

```
pages/content-list.tsx
  const modals = useContentListModals(slug)                 // owns every open/close flag
  <ContentToolbar … onOpenAutomation={() => modals.setAutomationPanelOpen(true)} />   // L249
  <ContentListModals … automationPanelOpen={modals.automationPanelOpen}              // L340+
                       onOpenChangeAutomation={modals.setAutomationPanelOpen} />
features/content-management/components/ContentListModals.tsx
  imports EntryEditorDialog, ContentDeleteDialog, BulkEditDialog, CardConfigDialog, AutomationPanel
```

**Existing browser-download idiom — `features/bulk-edit/bulk-edit-steps.tsx:L27-L44`**

```ts
const blob = new Blob([csvContent], { type: 'text/csv' })
const url = URL.createObjectURL(blob)
const downloadAnchor = document.createElement('a')
downloadAnchor.href = url
downloadAnchor.download = `bulk-edit-failures-${slug}.csv`
downloadAnchor.click()
URL.revokeObjectURL(url)
```

S4 reuses this shape with a blob that comes from the network instead of from a local string.

**Router — `App.tsx`**

`createBrowserRouter` with a flat `path:` array. `/content/create-new` (L183) already sits beside
`/content/:slug/create` (L199); `/content/:slug/:id` is L215 and `/content/:slug` is L223. Every
protected row is `element: <ProtectedRoute><SomePage /></ProtectedRoute>`.

**Other facts the executing agent needs and must not re-discover**

- Query client: `@tanstack/react-query` **^5.90.21**. In v5 `refetchInterval` accepts
  `(query) => number | false` and receives the `Query` object (`query.state.data`).
- Toasts: `import { toast } from "sonner"` (idiom in `features/rbac/components/*.tsx`).
- i18n: `react-i18next`, `useTranslation()`, locale files `src/locales/en.json` and
  `src/locales/it.json`, nested keys (`toolbar.*`, `content.*`, `bulkEdit.*`).
- Icons: `reicon-react`. Verified present: `Export`, `Import`, `Loader`, `AlertTriangle`,
  `CloudCheck`, `Download`, `Upload`. The idiom allows aliasing (`import { Grid as Table }`).
- Quote style in `apps/dashboard` is **double quotes** (`testing_conventions.md` §9.3).
- `apps/dashboard/src/test/cross-slice/barrels.test.ts` asserts each barrel's principal exports.

==========================================================================
SECTION 3 — DELIVERABLES
==========================================================================

**New — `apps/dashboard/src/features/content-transfer/` (the slice)**

| File | Contents |
|---|---|
| `index.ts` | Barrel. Exports `ImportWizardDialog`, `ImportJobPanel`, `downloadExport`, `useImportJob`, `TRANSFER_QUERY_KEYS`, and the `ImportJobResponse` / `ImportJobState` / `ImportRowError` types. |
| `api/transfer.api.ts` | `downloadExport`, `presignImportObject`, `createImportJob`, `fetchImportJob`, `readProblem`, the wire types, and the format→MIME / format→extension maps. |
| `consts/transfer.keys.ts` | `TRANSFER_QUERY_KEYS`, `IMPORT_JOB_POLL_MS`. |
| `hooks/use-import-job.ts` | `useImportJob(jobId)` — the polling query that stops on a terminal state. |
| `components/import-wizard-dialog.tsx` | The three-step dialog and its state machine. |
| `components/import-job-panel.tsx` | State badge, counters, capped error table. Used by the dialog **and** by the standalone page. |
| `test/unit/transfer-api.test.ts` | unit — request construction, MIME derivation, problem parsing. |
| `test/unit/use-import-job.test.ts` | unit — polling starts, stops on terminal, disabled without an id. |
| `test/unit/import-job-panel.test.tsx` | unit — the capped report rendering. |

**New — page and route**

| File | Contents |
|---|---|
| `apps/dashboard/src/pages/import-job-detail.tsx` | `ImportJobDetailPage` — reads `:jobId`, renders `<ImportJobPanel />` inside the standard sidebar shell. |
| `apps/dashboard/src/App.tsx` | One import + one route row for `/content/import-jobs/:jobId`. |

**New — toolbar control (inside `content-toolbar`, presentational only)**

| File | Contents |
|---|---|
| `apps/dashboard/src/features/content-toolbar/toolbar-components/transfer-menu.tsx` | `TransferMenu` — the dropdown. Zero API calls, zero query state. |

**Modified**

| File | Change |
|---|---|
| `features/shared/view-registry.ts` | Add `'transfer'` to the `ToolbarTool` union. |
| `features/content-toolbar/shared.ts` | Add `"transfer"` to `DEFAULT_ENABLED_TOOLS`. |
| `features/content-toolbar/view-registry.bootstrap.ts` | Add `'transfer'` to the `table` view's `enabledTools`. |
| `features/content-gallery/index.ts` | Add `'transfer'` to `registerContentGalleryView`'s `enabledTools`. |
| `features/content-kanban/index.ts` | Add `'transfer'` to `registerContentKanbanView`'s `enabledTools`. |
| `features/content-toolbar/types.ts` | Add two optional props: `onExport?`, `onOpenImport?`. |
| `features/content-toolbar/content-toolbar.tsx` | One import, one destructure, one guarded render block. |
| `features/content-management/hooks/use-content-list-modals.ts` | `importWizardOpen` state + setter, returned. |
| `features/content-management/components/ContentListModals.tsx` | Two props; mount `<ImportWizardDialog>`; invalidate the content list on completion. |
| `pages/content-list.tsx` | Wire `onExport` and `onOpenImport`. |
| `src/locales/en.json`, `src/locales/it.json` | The `transfer.*` key block. |
| `src/test/cross-slice/barrels.test.ts` | One assertion row for the new barrel. |

**Explicitly excluded from this sprint:** any file under `packages/core/` or `apps/api/`, any
migration, any change to `lib/upload.ts`, any change to `pages/drafts-list.tsx`.

==========================================================================
SECTION 4 — TASK DETAILS
==========================================================================

Every file below opens with the SPDX header, byte-identical to the rest of the repo
(`testing_conventions.md` §1.2):

```ts
// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2024–2026 Flavio De Musso. All rights reserved.
// See LICENSE in the repository root for license terms.
```

---

#### 4.1 `features/content-transfer/consts/transfer.keys.ts` (new)

```ts
export const TRANSFER_QUERY_KEYS = {
  all: ["import-jobs"] as const,
  detail: (jobId: string) => [...TRANSFER_QUERY_KEYS.all, jobId] as const,
}

/** Two seconds: a chunk of DEFAULT_IMPORT_CHUNK_ROWS rows completes well inside this, so the
 *  counters advance visibly without hammering an endpoint that reads a D1 row per call. */
export const IMPORT_JOB_POLL_MS = 2_000
```

---

#### 4.2 `features/content-transfer/api/transfer.api.ts` (new)

```ts
import { isAxiosError } from "axios"
import type { TransferFormat } from "@beechcms/core"

import { api } from "@/lib/api"

export type ImportJobState = "pending" | "processing" | "completed" | "failed"

/** One rejected row. `row` is the 1-based index of the DATA record, header excluded. */
export interface ImportRowError {
  row: number
  code: string
  message: string
  field?: string
}

/** The wire shape of GET /api/content/import-jobs/:id. `objectKey` and `createdBy` are
 *  deliberately absent from the endpoint — do not add them here to "complete" the type. */
export interface ImportJobResponse {
  id: string
  targetSeed: string
  format: TransferFormat
  state: ImportJobState
  rowsRead: number
  insertedRows: number
  failedRows: number
  errors: ImportRowError[]
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

export interface PresignResponse {
  uploadUrl: string
  key: string
  expiresIn: number
}

/** RFC 7807, as `publicProblem()` emits it. `type` is the contract; `detail` is copy. */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  errors?: Array<{ field?: string; expected?: string; received?: string; message?: string }>
}

const TERMINAL_STATES: ReadonlySet<ImportJobState> = new Set<ImportJobState>(["completed", "failed"])

export function isTerminalState(state: ImportJobState | undefined): boolean {
  return state !== undefined && TERMINAL_STATES.has(state)
}

const FILE_EXTENSIONS: Record<TransferFormat, string> = { csv: "csv", ndjson: "ndjson" }

/**
 * The MIME type sent to POST /upload/presign, derived from the chosen FORMAT and never from
 * `file.type` — a browser reports "" for a .ndjson file, and `application/x-ndjson` is absent
 * from the upload allowlist (packages/core/src/media/file-types.ts), so presigning under its
 * canonical type is refused. The stored content type is not authoritative: the import handler
 * takes `format` from the request body and never reads head.contentType.
 */
const PRESIGN_MIME_TYPES: Record<TransferFormat, string> = {
  csv: "text/csv",
  ndjson: "application/json",
}

const CONTENT_TYPES: Record<TransferFormat, string> = {
  csv: "text/csv",
  ndjson: "application/x-ndjson",
}

/**
 * Reads the problem body out of an axios error, including the blob case: with
 * `responseType: "blob"` axios hands back a Blob even on 4xx, so `error.response.data` is not
 * the parsed JSON the rest of the app expects.
 */
export async function readProblem(error: unknown): Promise<ProblemDetails | null> {
  if (!isAxiosError(error) || !error.response) return null
  const data: unknown = error.response.data
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text()) as ProblemDetails
    } catch {
      return null
    }
  }
  if (typeof data === "object" && data !== null && "type" in data) return data as ProblemDetails
  return null
}

/**
 * Streams the export into a Blob and hands it to the browser as a download.
 * `timeout: 0` overrides the client's 30 s default: an export up to EXPORT_MAX_ROWS rows can
 * legitimately stream for longer, and aborting mid-stream is the corrupted-file failure the
 * server's 413 cap exists to prevent.
 */
export async function downloadExport(slug: string, format: TransferFormat): Promise<void> {
  const response = await api.get<Blob>(`/content/${slug}/export`, {
    params: { format },
    responseType: "blob",
    timeout: 0,
  })

  // The filename the API sets in Content-Disposition; rebuilt rather than parsed, because the
  // header is not exposed to the browser on a cross-origin response and parsing it would be a
  // second, weaker source of truth.
  const filename = `${slug}.${FILE_EXTENSIONS[format]}`
  const blob = new Blob([response.data], { type: CONTENT_TYPES[format] })
  const url = URL.createObjectURL(blob)
  const downloadAnchor = document.createElement("a")
  downloadAnchor.href = url
  downloadAnchor.download = filename
  downloadAnchor.click()
  URL.revokeObjectURL(url)
}

/**
 * presign -> PUT. Returns the R2 object key that POST /content/:slug/import consumes.
 *
 * Deliberately NOT lib/upload.ts's uploadFile(): that helper also calls POST /upload/confirm,
 * which registers the object in the media library. An import file is transport — the chunk
 * worker deletes it on a terminal job state — so a permanent media row would outlive the object.
 */
export async function presignImportObject(file: File, format: TransferFormat): Promise<string> {
  const presign = await api.post<PresignResponse>("/upload/presign", {
    filename: file.name,
    mimeType: PRESIGN_MIME_TYPES[format],
    sizeBytes: file.size,
  })

  const putResponse = await fetch(presign.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": PRESIGN_MIME_TYPES[format] },
    body: file,
  })
  if (!putResponse.ok) throw new Error(`Storage PUT failed: ${putResponse.status}`)

  return presign.data.key
}

export async function createImportJob(
  slug: string,
  objectKey: string,
  format: TransferFormat,
): Promise<string> {
  const response = await api.post<{ jobId: string }>(`/content/${slug}/import`, { objectKey, format })
  return response.data.jobId
}

export async function fetchImportJob(jobId: string): Promise<ImportJobResponse> {
  const response = await api.get<ImportJobResponse>(`/content/import-jobs/${jobId}`)
  return response.data
}
```

**Binding notes.**
- No `try/catch` swallowing in this module. Callers decide what a failure means; `readProblem` is
  how they read it.
- The `Content-Type` sent on the PUT **must** equal the `mimeType` sent to presign, or S3 signature
  validation rejects the upload. Both read from `PRESIGN_MIME_TYPES`, once.
- `presignImportObject` has **no 501 fallback** to the proxied `POST /upload` route. That route does
  return a `key`, but it streams the file through the Worker — for a 50 MB import file that is the
  CPU/memory profile the presigned flow exists to avoid, and the brief (§2, §4) makes presigned
  upload the exclusive transport. A 501 surfaces to the user as "direct upload is not configured on
  this deployment".

---

#### 4.3 `features/content-transfer/hooks/use-import-job.ts` (new)

```ts
import { useQuery, type UseQueryResult } from "@tanstack/react-query"

import { fetchImportJob, isTerminalState, type ImportJobResponse } from "../api/transfer.api"
import { IMPORT_JOB_POLL_MS, TRANSFER_QUERY_KEYS } from "../consts/transfer.keys"

/**
 * Polls a job until it reaches a terminal state, then stops by itself.
 *
 * There is no cancel endpoint and no push channel: S3 shipped exactly two import routes, so the
 * job's own `state` field is the only signal that the work is over. Returning `false` from
 * refetchInterval is what ends the polling — an unmount-only stop would keep a completed job
 * refetching for as long as the dialog stays open.
 */
export function useImportJob(jobId: string | null): UseQueryResult<ImportJobResponse> {
  return useQuery({
    queryKey: TRANSFER_QUERY_KEYS.detail(jobId ?? ""),
    queryFn: () => fetchImportJob(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (query) => (isTerminalState(query.state.data?.state) ? false : IMPORT_JOB_POLL_MS),
    refetchOnWindowFocus: false,
    retry: false,
  })
}
```

`retry: false`: a 403 or 404 on a job id is a permanent answer, and retrying it three times only
delays the message the user needs.

---

#### 4.4 `features/content-transfer/components/import-job-panel.tsx` (new)

Props and behaviour (exact JSX is the executing agent's, the contract below is not):

```ts
export interface ImportJobPanelProps {
  jobId: string
  /** Fired once, on the first render in which the job reaches `completed`. */
  onCompleted?: (job: ImportJobResponse) => void
}
```

- Calls `useImportJob(jobId)`.
- `isLoading` → a `Loader` icon and the "loading" string. `error` → `readProblem(error)`; a `403`
  renders the not-authorised string, a `404` the unknown-job string, anything else `detail`.
- On data, renders, in this order:
  1. a state badge — `pending` / `processing` (with a spinning `Loader`) / `completed` / `failed`;
  2. the counters `rowsRead`, `insertedRows`, `failedRows`, and `targetSeed` + `format`;
  3. a `<Progress>` bar **only** while `processing`, and **indeterminate** — the job record carries
     no total row count (S3 stores an offset, never a denominator), so a percentage would have to be
     invented;
  4. when `errors.length > 0`, a table of `row`, `field`, `code`, `message`;
  5. when `failedRows > errors.length`, one line stating that the report is capped and how many
     failures are not listed — the cap is `MAX_JOB_ERROR_SAMPLES` on the server and the client must
     never present a truncated list as complete.
- `onCompleted` fires from a `useEffect` keyed on `job?.state`, guarded so it runs once.

The panel owns **no** open/close state and performs **no** navigation. It is rendered by the wizard
and by the page.

---

#### 4.5 `features/content-transfer/components/import-wizard-dialog.tsx` (new)

```ts
import type { Seed, TransferFormat } from "@beechcms/core"

export interface ImportWizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  seed: Seed
  /** Fired when a job reaches `completed`, so the caller can invalidate its own query keys.
   *  The wizard does not know the content-management key namespace and must not import it. */
  onImportCompleted?: () => void
}

type WizardStep = "pick" | "uploading" | "tracking"
```

State machine — three steps, one direction, no back edge out of `tracking`:

**Step `pick`.**
- `isFlatSeed(seed)` (imported from `@beechcms/core`) decides whether the CSV radio is selectable.
  When false, CSV is **disabled** and the explanation names the offending branches from
  `nonFlatBranches(seed).map((branch) => branch.alias)` — the same branches the API would list in
  `errors[]`. Default format: `"csv"` when the seed is flat, otherwise `"ndjson"`.
- A single `<input type="file">` with `accept=".csv,.ndjson,.json,.txt"`. No client-side parsing, no
  size check (VETO Audit §4).
- Before enabling the primary button, check `canGlobally("content:create")` from `usePermissions()`.
  When false, the button is disabled and an inline warning states that uploading an import file
  currently requires the global content-create permission — the S3-deferred presign scope gap, named
  rather than disguised as a generic failure.

**Step `uploading`** — one async sequence, no user input:
```ts
const objectKey = await presignImportObject(file, format)
const jobId = await createImportJob(seed.slug, objectKey, format)
setJobId(jobId); setStep("tracking")
```
- Every failure lands in one `catch`: `const problem = await readProblem(error)`, then
  `toast.error(problem?.detail ?? t("transfer.import.errors.unknown"))` and `setStep("pick")` so the
  user can correct and retry. A `403` from the presign call maps to the permission string, a `501`
  to the not-configured string, and `content-import-file-too-large` / `content-csv-requires-flat-seed`
  surface the server's own `detail`.
- The dialog is **not closable** during this step (`onOpenChange` ignored, no close button): a close
  between the PUT and the POST orphans an R2 object. The object is still covered by the R2 lifecycle
  rule S3 documented, but not creating orphans is cheaper than relying on the backstop.

**Step `tracking`** — renders `<ImportJobPanel jobId={jobId} onCompleted={...} />` plus:
- a link to `/content/import-jobs/${jobId}` ("open the full job page"), which is the shareable URL a
  colleague with write scope on the same seed can open;
- a Close button, enabled at all times — closing does not cancel anything, because nothing can be
  cancelled;
- `onCompleted` → `onImportCompleted?.()`.

Closing the dialog resets `step` to `"pick"`, `file` to `null` and `jobId` to `null`. A reopened
wizard starts a new import; it does not resume the previous one.

---

#### 4.6 `features/content-transfer/index.ts` (new)

```ts
export { ImportWizardDialog } from "./components/import-wizard-dialog"
export { ImportJobPanel } from "./components/import-job-panel"
export { useImportJob } from "./hooks/use-import-job"
export { downloadExport, isTerminalState, readProblem } from "./api/transfer.api"
export { TRANSFER_QUERY_KEYS, IMPORT_JOB_POLL_MS } from "./consts/transfer.keys"
export type {
  ImportJobResponse,
  ImportJobState,
  ImportRowError,
  ProblemDetails,
} from "./api/transfer.api"
```

`presignImportObject` and `createImportJob` are **not** exported: they are the wizard's internals,
and a second caller composing them by hand would be a second import flow.

---

#### 4.7 `features/shared/view-registry.ts` (modified — one line)

```ts
export type ToolbarTool =
  | 'filter'
  | 'sort'
  | 'automation'
  | 'search'
  | 'settings'
  | 'create'
  | 'transfer'
```

#### 4.8 Tool registration (modified — one array entry each)

- `features/content-toolbar/shared.ts`: append `"transfer"` to `DEFAULT_ENABLED_TOOLS`.
- `features/content-toolbar/view-registry.bootstrap.ts`: the `table` registration becomes
  `enabledTools: ['filter', 'sort', 'automation', 'search', 'settings', 'create', 'transfer']`.
- `features/content-gallery/index.ts` and `features/content-kanban/index.ts`: append `'transfer'` to
  the `enabledTools` array inside `registerContentGalleryView` / `registerContentKanbanView`.

Export and import are view-independent — the rows are the same whether they are drawn as a table, a
gallery or a board — so every registered view opts in.

#### 4.9 `features/content-toolbar/types.ts` (modified — two optional props)

```ts
import type { Seed, TransferFormat } from "@beechcms/core"
// …
  /** Fires the export download. Optional: drafts-list.tsx renders this toolbar over a
   *  multi-seed list where a single-seed export has no meaning. */
  onExport?: (format: TransferFormat) => void
  /** Opens the import wizard. Optional, for the same reason. */
  onOpenImport?: () => void
  /** True while an export request is in flight, so the menu can show a spinner. */
  isExportPending?: boolean
```

`TransferFormat` is imported from `@beechcms/core`, **not** from `@/features/content-transfer` —
that is what keeps this slice free of a sibling import.

#### 4.10 `features/content-toolbar/toolbar-components/transfer-menu.tsx` (new)

```ts
export interface TransferMenuProps {
  readonly seed: Seed
  readonly onExport?: (format: TransferFormat) => void
  readonly onOpenImport?: () => void
  readonly isExportPending?: boolean
}
```

- A `DropdownMenu` triggered by a `Button variant="ghost" size="icon-sm"` carrying the `Export` icon
  (or `Loader` with a spin class while `isExportPending`), wrapped in the `Tooltip` /
  `TooltipTrigger asChild` / `TooltipContent side="top"` idiom every other tool uses.
- Contents:
  - `DropdownMenuLabel` — the export group label;
  - `DropdownMenuItem` "CSV" — `disabled={!isFlatSeed(seed) || isExportPending}`. When disabled, the
    row still renders and a `DropdownMenuLabel` beneath it names the offending branches from
    `nonFlatBranches(seed)`. A silently missing row teaches the user nothing.
  - `DropdownMenuItem` "NDJSON" — always enabled.
  - `DropdownMenuSeparator`, then `DropdownMenuItem` "Import…" with the `Import` icon, rendered only
    when `onOpenImport` is supplied.
- Gating, using the hook the toolbar already calls:
  - the whole export group renders only when `can("content:read", seed.slug)` **and** `onExport` is
    supplied;
  - the import row renders only when `can("content:create", seed.slug)` **and** `onOpenImport` is
    supplied;
  - when neither group would render, the component returns `null` — no empty dropdown.
- The component performs no network call and holds no state beyond the dropdown's own `open`.

#### 4.11 `features/content-toolbar/content-toolbar.tsx` (modified — three edits)

1. `import { TransferMenu } from "./toolbar-components/transfer-menu"`.
2. Destructure `onExport`, `onOpenImport`, `isExportPending` from `props` alongside the existing ones.
3. Inside the right-hand tools `div`, after the `settings` block:

```tsx
{isToolEnabled("transfer") && (
  <TransferMenu
    seed={seed}
    onExport={onExport}
    onOpenImport={onOpenImport}
    isExportPending={isExportPending}
  />
)}
```

`seed` is already destructured at L25. `drafts-list.tsx` passes neither handler, so `TransferMenu`
returns `null` there and that page needs no edit.

#### 4.12 `features/content-management/hooks/use-content-list-modals.ts` (modified)

Add beside the existing dialog flags (L46-L50):

```ts
const [importWizardOpen, setImportWizardOpen] = React.useState(false)
```

and return `importWizardOpen` and `setImportWizardOpen` in the hook's result object, in the same
style as `automationPanelOpen` / `setAutomationPanelOpen`.

#### 4.13 `features/content-management/components/ContentListModals.tsx` (modified)

Props added to `ContentListModalsProps`:

```ts
  importWizardOpen: boolean
  onOpenChangeImportWizard: (open: boolean) => void
```

Import and mount, beside the five existing dialogs:

```tsx
import { ImportWizardDialog } from "@/features/content-transfer"
// …
{slug && (
  <ImportWizardDialog
    open={importWizardOpen}
    onOpenChange={onOpenChangeImportWizard}
    seed={seed}
    onImportCompleted={() => {
      // The imported rows are new content entries; the list query must not keep serving the
      // pre-import page from cache. Invalidated here rather than inside the wizard, because
      // CONTENT_QUERY_KEYS belongs to this slice and content-transfer must not import it.
      queryClient.invalidateQueries({ queryKey: CONTENT_QUERY_KEYS.lists() })
      queryClient.invalidateQueries({ queryKey: FACET_QUERY_KEYS.bySlug(slug) })
    }}
  />
)}
```

`const queryClient = useQueryClient()` at the top of the component; `CONTENT_QUERY_KEYS` and
`FACET_QUERY_KEYS` come from `../consts/content.keys` — a same-slice relative import.

#### 4.14 `pages/content-list.tsx` (modified)

```tsx
import { downloadExport, readProblem } from "@/features/content-transfer"
import { toast } from "sonner"
import type { TransferFormat } from "@beechcms/core"
// …
const [isExportPending, setIsExportPending] = React.useState(false)

const handleExport = React.useCallback(
  async (format: TransferFormat) => {
    if (!slug) return
    setIsExportPending(true)
    try {
      await downloadExport(slug, format)
    } catch (error) {
      const problem = await readProblem(error)
      toast.error(problem?.detail ?? t("transfer.export.errors.unknown"))
    } finally {
      setIsExportPending(false)
    }
  },
  [slug, t],
)
```

Wired into the existing elements:

```tsx
<ContentToolbar
  …
  onExport={handleExport}
  onOpenImport={() => modals.setImportWizardOpen(true)}
  isExportPending={isExportPending}
/>

<ContentListModals
  …
  importWizardOpen={modals.importWizardOpen}
  onOpenChangeImportWizard={modals.setImportWizardOpen}
/>
```

The `413 content-export-too-large` case needs no special branch: the server's `detail` already tells
the caller to narrow the range, and `readProblem` reads it out of the blob response body.

#### 4.15 `pages/import-job-detail.tsx` (new)

```tsx
export function ImportJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>()
  // … SidebarProvider / AppSidebar / SidebarInset / SiteHeader shell, copied from content-trash.tsx
  //     which is the smallest existing page using it
  return /* … */ <ImportJobPanel jobId={jobId} />
}
```

No polling logic here: `ImportJobPanel` owns it. No seed lookup: `targetSeed` arrives in the
response.

#### 4.16 `App.tsx` (modified — one import, one route row)

```tsx
import { ImportJobDetailPage } from "@/pages/import-job-detail"
// …
{
  path: "/content/import-jobs/:jobId",
  element: (
    <ProtectedRoute>
      <ImportJobDetailPage />
    </ProtectedRoute>
  ),
},
```

**Placement note, binding.** Put the row immediately before `path: "/content/:slug/create"` (L199),
next to the other literal-prefixed `/content/create-new` row. React Router ranks static segments
above dynamic ones, so `/content/import-jobs/<uuid>` resolves here and not at
`/content/:slug/:id` (L215) regardless of array order — but the grouping keeps the two literal
`/content/*` routes visible together, which is the same reason S3's `PROTECTED_ROUTES` row sits in
the literal-prefix block.

#### 4.17 Locale keys (modified — `src/locales/en.json` and `src/locales/it.json`)

One new top-level `transfer` block, mirrored in both files, covering: the menu trigger and labels;
the CSV-disabled explanation (with a `{{branches}}` interpolation); the wizard title, step labels,
file and format labels, and buttons; the presign-permission warning; the job states; the counter
labels; the capped-report line (with a `{{count}}` interpolation); and the error strings referenced
in §4.5 and §4.14. No user-visible string is hardcoded in a component.

#### 4.18 Tests

All three suites are **unit tier** (`testing_conventions.md` §0): the subject is request
construction, polling behaviour and rendering, and every I/O boundary is mocked. They live under
`features/content-transfer/test/unit/`, mirroring the placement `content-management` already uses
(Rule 1.1). Mock factories sit above the imports that consume them and reset explicitly (Rule 3.9).

**`test/unit/transfer-api.test.ts`** — `describe("downloadExport", …)`,
`describe("presignImportObject", …)`, `describe("createImportJob", …)`, `describe("readProblem", …)`
(Rule 1.4). Mocks `@/lib/api` only (Rule 3.10). Behaviours, one `it()` each (Rule 1.6), each naming
the outcome without "should" (Rule 1.5):

- `downloadExport` requests `/content/posts/export` with `params.format`, `responseType: "blob"` and
  `timeout: 0` — the timeout override is a regression guard, so it carries the §6.2(4) comment
  naming the truncated-stream defect it prevents.
- `presignImportObject` sends `mimeType: "application/json"` for `ndjson` **even when `file.type` is
  `"text/plain"`** — the §6.2(2) comment records why (the allowlist has no `application/x-ndjson`).
- `presignImportObject` sends `Content-Type: text/csv` on the PUT for `csv`, matching the presign.
- a non-ok PUT rejects: `await expect(…).rejects.toThrow(/Storage PUT failed: 500/)` (§7.5).
- `readProblem` parses a `Blob` error body and returns its `type`; returns `null` for a non-axios
  error.

Stub `global.fetch` with `vi.fn()` for the PUT, and build the `File` from a fixed string — no
randomness, no `Date.now()` (§7.7).

**`test/unit/use-import-job.test.ts`** — `describe("useImportJob", …)`. Mocks `../api/transfer.api`.
Rendered through `renderHook` with a `QueryClientProvider` whose client is built fresh per test
(Rule 3.2). Behaviours:

- a `null` jobId leaves the query disabled and `fetchImportJob` uncalled;
- a `processing` job yields a numeric `refetchInterval` and a `completed` one yields `false` —
  asserted by calling the resolved option with a stub query object, not by waiting on wall-clock
  time (§7.2 forbids sleeping, §7.3 forbids fake timers);
- a rejected fetch surfaces as `isError` without a retry (`fetchImportJob` called exactly once).

**`test/unit/import-job-panel.test.tsx`** — `describe("ImportJobPanel", …)`. Mocks
`../hooks/use-import-job`. Behaviours:

- a `completed` job with `failedRows: 250` and `errors.length === 100` renders the capped-report
  line naming the 150 unlisted failures — the regression guard against presenting a truncated
  report as complete (§6.2(4) comment required);
- a `processing` job renders the indeterminate progress bar and no percentage;
- `onCompleted` fires exactly once for a `completed` job across a re-render.

**`src/test/cross-slice/barrels.test.ts`** — one added assertion:
`expect(ContentTransferIndex.ImportWizardDialog).toBeTypeOf("function")`.

Not written in this sprint: an e2e suite. There is no `e2e/` tier harness for a flow that needs R2
and a queue consumer, and S3's integration suite already drives presign → PUT → import → completed
against real D1. Stated here because a deliberate omission is a required comment (§6.2(3)), and
`import-wizard-dialog.tsx` carries it in its file-level docblock, naming
`apps/api/src/features/content/test/integration/content-import.integration.test.ts` as the place the
end-to-end path is covered.

==========================================================================
SECTION 5 — VALIDATION
==========================================================================

```bash
# 1. Types — the only compiler gate that sees the dashboard bundle.
cd apps/dashboard && npx tsc --noEmit && cd ../..

# 2. Lint. Note the TS 7.0 noopParser workaround in eslint.config.js — a clean run here does
#    NOT prove type correctness; step 1 does.
pnpm lint

# 3. Tests, scoped to what changed.
pnpm beech test --diff

# 4. Full suite before the PR.
pnpm beech test

# 5. Manual verification against a running stack.
pnpm beech dev
```

Manual checklist against `pnpm beech dev`, with a seed that has at least one `relation`, `repeater`,
`tags` or `json` branch and one that has none:

```
a. Open /content/<a flat seed>. The toolbar shows the transfer menu; CSV and NDJSON are both
   selectable. Export CSV downloads <slug>.csv and the file opens in a spreadsheet.
b. Open /content/<a relational seed>. CSV is disabled and the explanation names the offending
   branch aliases. NDJSON exports.
c. Import a 5-row NDJSON file into the relational seed. The wizard reaches `tracking`, the
   counters advance, the state ends `completed`, and the 5 rows appear in the list without a
   manual refresh.
d. Import a file with 2 valid and 2 invalid rows. The job ends `completed` with
   insertedRows 2 / failedRows 2 and the error table names both rejected row numbers.
e. Copy the job URL, open /content/import-jobs/<jobId> in a new tab: the same report renders.
f. Log in as a user with content:create on one seed only and no global scope: the Import entry
   is visible, the upload button is disabled, and the inline warning explains why.
g. Log in as a viewer (content:read only): the export group renders, the Import entry does not.
h. Open /drafts. The transfer menu does not render, and the page behaves exactly as before.
```

No `pnpm beech db:migrate` and no `pnpm beech db:reset` are required: this sprint ships no
migration. If a local stack predates commit `81a8d7d`, run `pnpm beech db:migrate` once to pick up
S3's `import_jobs` migration — that is S3's artifact, not S4's.

==========================================================================
SECTION 6 — ACCEPTANCE CRITERIA
==========================================================================

**Boundaries**

- [ ] `git diff --name-only` lists **zero** files under `packages/core/` and **zero** under `apps/api/`.
- [ ] No new entry in any `package.json`.
- [ ] `apps/dashboard/src/lib/upload.ts` is unmodified.
- [ ] `apps/dashboard/src/pages/drafts-list.tsx` is unmodified and still compiles.
- [ ] No file under `features/content-transfer/` imports from any other `features/*` slice.
      `graphify update . --force` then `graphify path "ContentToolbar" "ImportWizardDialog"` returns
      no directed path.
- [ ] `TransferFormat` is imported from `@beechcms/core` in both `content-toolbar` and
      `content-transfer`; neither re-exports it for the other.
- [ ] `features/content-transfer/index.ts` does not export `presignImportObject` or `createImportJob`.

**Botanical / engine adherence**

- [ ] The CSV-vs-NDJSON decision calls `isFlatSeed` / `nonFlatBranches` from `@beechcms/core`. No
      branch-type list is re-declared anywhere in `apps/dashboard`.
- [ ] No `br_XX` id and no `content_import_jobs` column name appears in `apps/dashboard`.
- [ ] No byte-size or row-count limit constant is duplicated client-side; `413` responses are
      surfaced from the server's own `detail`.

**Typing**

- [ ] `npx tsc --noEmit` in `apps/dashboard` passes.
- [ ] No `any` in any new or modified file, tests included.
- [ ] `ImportJobResponse` has no `objectKey` and no `createdBy` field.
- [ ] The two new `ContentToolbarProps` members are optional.

**Behaviour — export**

- [ ] The transfer menu renders only for a caller holding `content:read` on the seed.
- [ ] CSV is disabled for a seed with any `relation`, `repeater`, `tags` or `json` branch, or any
      `file` branch with `multiple: true`, and the explanation names the offending aliases.
- [ ] A successful export downloads a file named `<slug>.csv` / `<slug>.ndjson`.
- [ ] The export request carries `timeout: 0`.
- [ ] A `413` / `400` / `403` renders the server's `detail`, not a generic failure string.

**Behaviour — import**

- [ ] The Import entry renders only for a caller holding `content:create` on the seed.
- [ ] The presign request carries `mimeType: "text/csv"` for CSV and `"application/json"` for
      NDJSON, derived from the chosen format and never from `file.type`; the PUT's `Content-Type`
      matches it.
- [ ] `POST /upload/confirm` is never called by the import flow.
- [ ] The dialog cannot be closed during the `uploading` step.
- [ ] A caller without `content:create` at global scope sees the Import entry, a disabled upload
      button, and the explicit presign-permission message.
- [ ] On `completed`, the content list and facet queries are invalidated and the imported rows
      appear without a manual refresh.
- [ ] Polling stops on `completed` and on `failed`: no further `GET /content/import-jobs/:id`
      request is issued after a terminal state.
- [ ] When `failedRows` exceeds `errors.length`, the panel states how many failures are not listed.
- [ ] `/content/import-jobs/<jobId>` renders the job panel and is not swallowed by
      `/content/:slug/:id`.

**Tests**

- [ ] Three new unit suites under `features/content-transfer/test/unit/`, each with the SPDX header
      and the `// @vitest-environment node` pragma where no DOM is needed.
- [ ] Filenames are `<subject>.test.ts(x)`; `describe()` names the exported symbol; no `it()` name
      contains "should".
- [ ] Four zones, one act per `it()`, act result assigned to a named variable.
- [ ] No `vi.useFakeTimers()`, no `setTimeout` sleep, no snapshot of an API response, no `it.only`.
- [ ] The §6.2 required comments are present: the `timeout: 0` regression guard, the NDJSON MIME
      magic value, the capped-report regression guard, and the deliberate e2e omission.
- [ ] `barrels.test.ts` asserts the new barrel.
- [ ] `pnpm beech test` passes.

==========================================================================
SECTION 7 — OUT OF SCOPE
==========================================================================

The executing agent MUST NOT build or modify any of the following.

1. **Any file under `apps/api/` or `packages/core/`.** Both endpoint surfaces are merged. If a
   defect is found in one, it is a bug fix in its own PR against the sprint that shipped it
   (`docs/Sprints/ContentExportStream/`, `docs/Sprints/ContentImportJobs/`) — not a silent edit
   inside a UI sprint.

2. **Fixing the presign global-scope gap.** `POST /api/upload/presign` demands `content:create` at
   `GLOBAL_SCOPE`, so a per-seed writer cannot presign an import file. This is S3's explicitly
   deferred item (ROADMAP, S3 "Deferred out of S3, for a future roadmap entry"); it is an
   `upload`-slice route-rule change with a blast radius across media uploads. S4 **names** the
   limitation in the UI and stops there.

3. **A range read on `BeechBucket.get`, an `application/x-ndjson` entry in `SUPPORTED_FILE_TYPES`,
   or any other core contract change.** Both were examined and rejected in S3's VETO Audit (§5, §6)
   and nothing in the UI tier changes that analysis.

4. **Job cancellation, job listing, job retry, or a "retry the failed rows" action.** No endpoint
   exists for any of them. Inventing a client-side retry that re-uploads the failed subset would be
   a second import path with its own duplicate semantics, against an insert-only API.

5. **Client-side parsing, validation, preview or row-count of the import file.** Validation is the
   Botanical Engine's, per the brief (§3, last user story). A browser-side preview would be a second
   validator that disagrees with the server the first time a branch policy changes.

6. **A client-side file-size or row-count limit.** VETO Audit §4: the authority is the server's
   `IMPORT_MAX_BYTES` / `EXPORT_MAX_ROWS`, surfaced through `413`.

7. **A progress percentage for an import.** The job record carries an offset, never a total
   (S3, §4.4). An invented denominator is a lie with a progress bar around it. Indeterminate only.

8. **WebSocket, SSE or Durable-Object push for job progress.** Polling a merged endpoint is the
   edge-native answer; a transport does not get invented for a two-second refresh.

9. **Retention, archiving or deletion UI for job records.** Job retention is indefinite by design
   and TTL/cleanup was discarded during sparring (brief §5).

10. **Bulk-export of a filtered selection, or wiring the toolbar's active filters into the export
    query.** `GET /api/content/:slug/export` accepts only `format`; S2 settled that a filtered export
    is not part of this contract. Passing filters the endpoint ignores would produce a file that
    silently disagrees with what the user saw on screen.

11. **Adding export or import to the Media Library, the Trash view, or `pages/drafts-list.tsx`.**
    One surface, the content list, is what the roadmap entry covers.

12. **Changing `lib/upload.ts`, the media flow, or `POST /upload/confirm` semantics.**
