queste sono le cose che lo sprint precedente ha escluso e che vanno pianificate per l implementazione 

- **Click-to-filter (`applyFilter`) on cell values** — deferred to a later sprint. The filter
  DSL exists; wiring cell clicks is a separate concern.
- **Single-click row routing / Load-More pagination** — YAGNI. Keep double-click routing and
  numbered server-side pagination. Do not add a second pagination paradigm.
- **Avatar *images* for relations** — initials only; image-branch convention is out.
- **Already implemented — do not reimplement:** rating stars & percentage bars, checkbox,
  tag/status badges, text truncation+reveal, column add/hide/reorder, page-length, sort,
  group-by, advanced filters, bulk actions, search, **column resizing & density** (TableDensity
  union, DENSITY_ROW_HEIGHT/DENSITY_CELL_PADDING maps, controlled columnSizing state,
  resize handles on th/td, density radio in settings menu).
- **Any `@beechcms/core` / `apps/api` / D1 change** — including server-side timestamp sorting.
  This sprint is dashboard-only by construction; if such a change appears necessary, STOP and
  escalate — it does not belong here.
- **`dialog.tsx` primitive retuning** — do not change durations, easing, or Radix wiring in the
  shared primitive. This sprint fixes *usage*, not the primitive.
- **View-model logic in `useEntryEditorDialog`** — data fetching, draft logic, and the blocker
  stay exactly as they are. Only render structure and mount lifecycle change.
- **Entry editor *page* (`src/pages/entry-editor.tsx`)** — slated for separate deletion; do not
  refactor it as part of this animation fix.
