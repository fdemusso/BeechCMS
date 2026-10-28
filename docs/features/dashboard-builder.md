---
title: Dashboard Builder
description: How the dashboard composer (pages, sections, columns, widget ghosts, drag and drop, draft recovery) works and which behaviours are deliberate. It reuses the entry layout builder's model.
---

# Dashboard Builder

The dashboard composer (`apps/dashboard/src/features/dashboard/builder/`) is the entry
[layout builder](./layout-builder.md) applied to **widgets** instead of fields. Same feel, same rules: read
that page first, the decisions there (neutral state colours, fewer boxes, disable don't remove, recover
instead of ask, animate only what removes a jump) are not repeated here. This page records what is
specific to the dashboard.

A layout is a list of **pages**, each with **sections**, each with **columns** on a 12-unit grid
(`columnSpans`, e.g. `[8, 4]`), each holding **widgets**. The first page is the default one the dashboard
opens on (home icon, "Set as default" moves a page first).

## What is shared with the entry builder

Extracted to `src/components/builder/` and imported by both builders (the entry builder's behaviour did not
change):

- `BuilderTabPill`: pill tabs (muted selection, double click renames, right click menu, red X on hover).
- `FLUSH_MENU`: the flush menu style.
- `GhostSkeleton`: the `bg-foreground/10` skeleton.
- `useAnimatedSectionHeight`: the section height lock during a drag.

## Widget ghosts

A widget in the builder is a **ghost**: inert, data-less, shaped like the card the dashboard will draw
(`builder/ghosts/`).

- `GhostShell` has the real `WidgetShell`'s corner, padding and header, but no blur or hover shadow: those
  are expensive to repaint while a drag moves dozens of ghosts.
- One **archetype** per visual family (stat, trio, line/area/bar chart, pie, table, list, gallery, text, form,
  actions, checklist, meter, status, generic), chosen by `ARCHETYPE_BY_TYPE` in `widget-ghost.tsx`. Custom
  widgets get the generic card. Unknown or disabled types get the dashed amber "unavailable" box, as the real
  host does. Recharts is never mounted: chart ghosts are plain SVG.
- Real text where it is free: the title (or the user's override), the note widget's content. A note has no
  card on the dashboard and has none here.
- The **bound seed** is a tag in the header; a seed-bound widget whose seed is not picked yet shows an amber
  "Needs setup" tag.
- **Variation is deterministic**: widths and heights come from the widget id (`seededSeries`), not
  `Math.random`. The drag overlay therefore draws exactly the original, and re-ordering never reshuffles
  skeletons. (The entry builder's text ghosts are random per mount; there the overlay differs slightly.)
- `WidgetGhost` is memoised on exactly what it draws (`ghostKey`), because the builder clones the whole draft on
  every change and widget objects never keep their identity.
- A widget whose `minColumnSpan` exceeds its column's span shows an amber hint (not blocking).

## Widget block interactions

- The whole card is the drag handle (5px activation, so a click stays a click).
- On hover: a gear (configure sheet) and a red X (remove). Both stop `pointerdown` so they never start a drag.
- **Double click** renames the title (override, max `DASHBOARD_WIDGET_TITLE_MAX`). Single click does nothing,
  on purpose: it would collide with the double click.
- **Right click**: configure, rename, duplicate, replace with, move to page, remove.
- `Enter` on a focused block opens the configure sheet.
- **Add widget** is a searchable `Command` list grouped by category (icon on the left); disabled widgets stay
  listed, greyed.

## Drag and drop

Same shape as the entry builder (`use-dashboard-dnd.ts`), with four kinds:

| Kind | Id | Lands on |
| --- | --- | --- |
| `page` | `page:<p>` | other pages |
| `section` | `section:<p>:<s>` | other sections |
| `column` | `column:<p>:<s>:<c>` | other columns of the same section |
| `widget` | `widget:<widgetId>` | other widgets, or a column's `zone` |

- Widgets move between columns and sections **while dragging** (on drag over); same-column reordering is
  finished on drop; `Esc` restores the snapshot.
- A full column (`MAX_WIDGETS_PER_COLUMN`) refuses the move: the widget stays, **one** toast at the drop.
- **A column's span travels with it** when columns are swapped (`[8, 4]` becomes `[4, 8]`), see `moveColumn`.
- The overlay is portalled to `document.body` and draws the real ghost(s) at the grabbed width.
- Section heights are locked while a widget is dragged (shared hook).
- Cross-page moves are **not** drag: use the widget's right-click "Move to page".

## Footer, scopes, drafts

- Footer: `[Back]` set apart, then `[Preview | Reset | Save]` in one `ButtonGroup`; all `outline`, normal
  weight, `rounded-control`. All disabled while dragging; `Esc` belongs to the drag (the dialog ignores it).
- Preview swaps the editor for the real renderer, with a fade.
- **Draft recovery** (`dashboard-draft-storage.ts`): `sessionStorage`, one draft per **scope**, validated
  structurally, with a fingerprint of the server layout (stale drafts are discarded). Written 400ms after the
  last change, never mid-drag, flushed on `pagehide`. No discard dialogs.
- After a reload `DashboardPage` reopens the builder on the scope that holds a draft. If the draft turns out
  stale the dialog closes again.
- **Switching scope keeps each scope's draft** while the dialog is open (a dot marks scopes with unsaved
  changes). **Leaving the builder** (Back, Esc, click outside, Save) drops **all** drafts, including the other
  scopes'. Save closes the dialog, so unsaved work in another scope is lost: a deliberate simplification.
- The dialog fades (200ms, no zoom); while the layout loads a skeleton of the page is shown, and the content
  fades in over it.

## Server validation

`dashboardLayoutSchema` (`packages/core`) now trims labels and refuses control characters, like the entry
layout: page label 1 to `DASHBOARD_PAGE_LABEL_MAX` (60), section label `DASHBOARD_SECTION_LABEL_MAX` (60),
widget title `DASHBOARD_WIDGET_TITLE_MAX` (80). The builder imports the same constants for `maxLength`.

## Invariants

| Area | Invariant | Reason |
| --- | --- | --- |
| Ghosts | Deterministic variation from the widget id | Overlay matches the original; no reshuffle |
| Ghosts | No blur or hover shadow, no Recharts | Repaint cost during a drag |
| Widget block | Single click does nothing, double click renames | A click action would fire on every double click |
| Columns | Span travels with its column | A column's width is part of what is moved |
| Drag preview | Portal on `document.body` | A transformed dialog offsets `position: fixed` |
| Section height | Only grows during a drag | Shrinking moves the targets |
| Drafts | Kept per scope while open, all dropped on leaving | Exit is not an interruption; a reload is |
| Footer | Preview, Reset and Save in one group; disabled while dragging | One style per row; no half-moved saves |
| Page | At least one section per page, at most 8 pages | Server schema |

## Known open points

- A widget dragged onto another page's tab (spring-loaded tab) is not implemented; the source sortable would
  unmount when the page switches. "Move to page" covers it.
- Ghost minimum heights per archetype are estimates of the real cards; compare them in the browser when a
  widget's layout changes.
