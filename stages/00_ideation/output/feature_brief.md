queste sono le cose non inserite nello sprint precedente riguardante la table view e il suo Ui refactor :
- **`DataTable` internals / resizable columns** — TanStack `columnResizing` is real table infra;
  it is its own follow-up sprint (*"Sprint 02 — Column Resizing & Density"*). Do not touch
  `data-table.tsx` here.
- **Click-to-filter (`applyFilter`) on cell values**. (forse ci vuole uno sprint 3)
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


ora il tuo compito e passare al implementazione di queste cose capendo davvero quali mantere e quali skippare. in ogni caso il database è una demo e può essere toccato modificato e resettato a necessita l importante e poi applicare i cambiamenti alla migrazione inizale 0000