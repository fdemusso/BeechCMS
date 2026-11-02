---
title: Layout Builder & Relation Fields
description: How the entry layout builder, its drag and drop, draft recovery and the relation field identity (avatar, search, multi-relation editor) work, and which behaviours are deliberate.
---

# Layout Builder & Relation Fields

This page records how the entry layout builder (`apps/dashboard/src/features/entry-editor/builder/`) and the
relation field work, and **why** each non-obvious choice was made. The builder is considered finished: most of
what looks like an oversight below is a decision taken after trying the alternative. Read the
[invariants](#invariants-do-not-change-without-a-new-decision) before changing any of it.

The builder is one of two that share an engine: the dashboard builder ([Dashboard Builder](./dashboard-builder.md))
runs on the same drag logic, section and column frames and draft storage (`src/components/builder/`). What is
specific to entries (the full-width rule, the field list, the left handle strip, equal-width columns) lives in an
adapter in `features/entry-editor/builder/`.

## Layout builder

The builder replaces the entry form inside the entry dialog (the pencil-and-template icon at the top right,
disabled while the builder is already open). A layout is a list of **tabs**, each with **sections**, each with
**columns**, each holding **fields**. The first tab is the **default** tab: the entry opens on it.

### Tabs

- Pill style, no accent colour: the selected tab has a `muted` background and a heavier weight, like the
  content view switcher.
- **Double click** renames. **Right click** opens a menu: rename, set as default (moves the tab to the first
  position; disabled on the default tab), delete (disabled on the last tab).
- The default tab shows a **home icon**, not a badge.
- A red **X** appears on hover (animated width and opacity) and deletes the tab. It is not rendered when the
  tab cannot be deleted.
- Tab names are limited to **15** characters, section labels to **50**. The inputs carry `maxLength` for
  comfort; the **server is the real gate** (see [Label validation](#label-validation-server-side)).
- The rename inputs use a thin, low-contrast focus ring (`ring-1 ring-ring/30`) and `rounded-md`: the shared
  `Input` ring is 3px and too loud for an inline edit.

### Sections

- Menu: rename, hide label, hide border, collapsible, columns (1 to 4), remove.
- The three toggles and the column-count choices **keep the menu open** (`event.preventDefault()` in
  `onSelect`) so several can be set in a row. Rename and Remove close it.
- The current column count is marked with a check on the left and the number sits on the right.
- Removing a section with **no fields** happens immediately; with fields it asks for confirmation.
- The menu is **flush** (`FLUSH_MENU` in `components/builder/flush-menu.ts`): no inner padding, square items and no margin on
  separators, so the window's own rounded corners (it clips its content) are the only rounding and only the
  first and last item show it. Items have `px-3` so the text is not against the edge.

### Fields and ghosts

A field in the builder is drawn as a **ghost**: inert, data-less, at the real control's size.

- Real controls (inputs, buttons, switches) are used where cheap; **skeletons** stand in for typed or loaded
  content. The heavy editors (TipTap, CodeMirror) are never mounted.
- A text box is a plain bordered box with one skeleton inside it, **not** a disabled `Input` with a skeleton on
  top (that reads as two ghosts, one inside the other).
- The text skeleton has a **random width between 30% and 80%** of the box's inner width, chosen once when the
  ghost mounts, so seeds with many text fields do not look stamped. `number` and `date` keep a fixed width.
- Ghost skeletons are `bg-foreground/10`, a notch darker than the default `Skeleton`; the default component is
  untouched.
- The multi-relation ghost reproduces the real editor's footprint (label row, scroll area, add button).
- Restricted (hashed) fields and single relations keep their real editor.
- `FieldGhost` and `FieldBlock` are memoised: dnd-kit redraws every draggable and droppable whenever the drop
  target changes, and re-rendering ghosts (dozens of inputs and skeletons per redraw) is what made it heavy.

### Columns and drop areas

- A column has no border at rest, only while it is empty or while a **field** is being dragged. The outline is
  a **thin continuous line in neutral grey**, never dashed and never the accent colour. The column under the
  pointer gets a darker grey line and a faint fill.
- An empty column holds only the **Add field** button, centred with a 6px margin so its hover does not touch the
  outline. Do not give the zone a minimum height of its own: the column's 48px minimum already includes the
  border.
- **Add field** opens a searchable list. The items are wrapped in a `CommandGroup` (that is what gives the list
  its padding), the field type sits at the right edge, and the highlight is cleared when the pointer leaves the
  list (cmdk otherwise keeps the last item lit).

### Drag and drop

- **Nothing moves while dragging.** The draft is left alone; the pointer decides a drop target (a column and the
  position in it), the column under it gets the darker outline and a thin **marker** is drawn between the fields
  where the dragged one would land, and the move is made once, at the drop. The dragged field stays in place at
  reduced opacity and the overlay follows the pointer. `Esc` and a drop outside any column change nothing, so
  there is no snapshot to restore. Live moves (the target opening a gap) were the first design and were
  **replaced**: every one redrew the whole page and re-measured every droppable.
- A column under the pointer but not over a field (the gap between two, below the last) is decided by the
  **nearest field of that column**, so the marker does not jump to the end.
- The drag preview (`DragOverlay`) is rendered in a **portal on `document.body`**: the entry dialog is
  positioned with a CSS transform, which would otherwise become the reference of the overlay's
  `position: fixed` and shift it away from the pointer. The preview draws the real item, not a generic chip.
- **Section height: eased at the drop, never touched during the drag** (`use-animated-section-height.ts`, switched
  on by the entry builder's `SectionCard` with `animateHeight`). Nothing changes size while a field is dragged, but
  the dialog is as tall as its content and vertically centred, so at the drop two sections change height in one
  frame and everything recentres. Each section reads its height once at pick-up and, when the drop leaves it
  at another height, eases between the two (a Web Animation, 160ms; reduced motion skips it). The dashboard builder
  does not turn it on. Locking sections during the drag (the previous design) is **not** needed any more.
- Drag-time cost is kept low: the list of droppables a kind of drag may land on is cached per drag kind (the
  droppable list is stable across pointer moves), and collision detection stops at the first accepted hit.
- A column also has a drag handle (visible on hover, only when a sibling column exists to swap with).
- A move the layout rules refuse (a full-width field needs a section of its own; a full-width field cannot go
  into a multi-column section) leaves the field where it was and shows **one** toast at the drop, naming the
  full-width field in the way.

### Footer

`Back` (icon only, in its own group), `Reset` and `Save` are a `ButtonGroup`; all three are `outline`, with
normal font weight and a corner radius capped at 10px (`FOOTER_RADIUS`; `--radius` makes `rounded-lg` 16px,
which turns a 32px button into a pill). **Add section** uses the same radius.

> **Decision: this is the reference style for action rows.** The group structure (icon-only Back set apart,
> then the two actions together), the shared `outline` variant, normal weight and the 10px radius are the
> ones to reuse in other dialogs and panes. `FOOTER_RADIUS` (`builder/footer-style.ts`) is now just
> `rounded-control`, the project-wide control radius (see "Radii: controls and surfaces"); do not tune it per
> screen.

The **entry dialog's footer** has the same shape: a `border-t` row with `py-4` (equal space above and below
the buttons, in both screens), an icon-only **Delete** in its own group next to **Save** (with the draft
menu chevron attached to Save when drafts are on). Delete is an `outline` icon button; only its icon turns
red on hover (`hover:[&_svg]:text-destructive`), the border and background stay neutral. When references
block the deletion it stays disabled with the same tooltip.

- `Back` leaves the builder and discards the draft. There is deliberately **no** "unsaved changes" dialog: the
  draft is recovered instead (see below). Do not bring `handleAttemptClose` or a discard confirmation back.
- All three buttons are disabled **while anything is being dragged**, since a click mid-drag would save, reset
  or close a half-moved layout. At the drop they return to their own rules (`Save` is enabled only when the
  draft differs from what is saved).
- `Esc` does not close the dialog during a drag (it cancels the drag).

### Draft recovery

Unsaved work survives a **reload** (`layout-draft-storage.ts`, a thin wrapper over the shared
`createDraftStorage`: it only names the key and says what a `FormLayout` looks like):

- Stored in `sessionStorage`, one draft per seed, validated structurally on read (not with the strict layout
  schema), with a fingerprint of the layout stored on the server; a draft whose base no longer matches is stale
  and is discarded.
- Written 400ms after the last change, never mid-drag, and flushed on `pagehide`.
- **Leaving on purpose** (Back, closing the dialog, saving) clears it. A reload never unmounts the builder, so a
  draft that exists at load time means the work was interrupted.
- When a ready draft exists the entry editor **reopens the builder directly** (no notification). The entry
  editor is a route (`/content/:slug/:id|create`), so a reload comes back to the same entry.
- Every storage access is wrapped: if storage is blocked or full the builder behaves as without recovery.

### Label validation (server side)

`PUT /api/schema/:slug/layout` validates labels with `formLayoutSchema` (`packages/core`,
`seed-layout.ts`), using the constants `LAYOUT_TAB_LABEL_MAX` (15) and `LAYOUT_SECTION_LABEL_MAX` (50), which
the dashboard also imports for its `maxLength`, so the numbers cannot drift:

- **Validate:** a label over the limit, empty (tabs), or containing control characters (newlines, NUL, etc.) is
  **refused with 422** and nothing is stored. It is not shortened: a longer label can only come from a client
  other than the dashboard, and quietly truncating it would hide that.
- **Clean:** labels are trimmed before they are measured and before they are stored, so `"  Intro  "` is saved
  as `"Intro"` and a tab of spaces is empty and refused.
- **Save:** only the validated, trimmed layout reaches the repository (`semantic.cleaned`).
- Markup is not stripped: labels are rendered as text only, never as HTML.
- A layout stored before this limit may hold longer labels. They are served as they are, but saving that layout
  again is refused until the label is shortened.

## The entry dialog around the builder

The builder lives **inside** the entry dialog (`schema-form-shell.tsx`), which stays mounted: the form is only
hidden (`hidden`) while the builder is open. Three things follow from that.

### Resizing between the form and the builder

`use-animated-mode-height.ts` eases the dialog's height when `builderMode` flips (Edit layout, Back):

- It animates a **wrapper around the body** (`flex min-h-0 flex-col`), never the dialog itself. The wrapper
  is pinned to the old height, then eased (200ms, `ease-out`) to the new one and handed back to `auto`.
- **The wrapper must not be `flex-1`.** A flex item's size comes from `flex-basis`; with `flex-1`
  (`flex-basis: 0%`) the inline `height` is silently ignored and the switch stays instant. This was the first
  reason the animation "did nothing".
- The resting height is recorded with a **callback ref** plus a `ResizeObserver`. An effect on mount does not
  work: the dialog's content mounts after the hook first runs, so it never finds the element.
- The new view keeps settling a beat after the switch, so before releasing the box it re-measures and eases
  the rest of the way (at most twice, so a view that never settles cannot leave the box clipped).
- A second flip while moving retargets from where the box is; repeated clicks read as one motion.
- While it moves the wrapper carries `data-resizing`, and the shell turns off the scrolling inside
  (builder scroll area, `ScrollArea` viewport and bar): a box briefly shorter than its content would flash
  scrollbars. Scrolling comes back when it stops.
- Reduced motion skips all of it.

### Nothing may grow after the switch

The builder's scroll container used to have `space-y-4`. dnd-kit appends its own elements (screen-reader text,
live region) after the content inside `DndContext`, and they took part in that spacing, so the content grew
16px a moment after mounting and the dialog widened a second time. The spacing now sits on an inner wrapper
around tabs, sections and Add section. Keep `DndContext`'s own nodes out of any `space-*`/`gap-*` flow.

### Open, close, and the panels inside

- **Fade.** The dialog fades in and out (200ms, no zoom). Closing by X, overlay or Esc plays the exit before
  the route changes (`requestClose` waits for the fade, then calls `goBack`); if `goBack` is refused by the
  unsaved-changes blocker, the dialog comes back. The body is keyed on loading, so when data arrives the
  content fades in over the skeleton instead of popping in.
- **Referenced by** starts **closed every time**: the panel is remounted when the builder opens and closes
  (`key={builderMode ? "builder" : "form"}`), because the form is only hidden and would keep its state.
  It opens and closes with an animated height (`collapsible-down/up`, defined once in `index.css` and applied
  in `ui/collapsible.tsx`, so every `Collapsible` has it) and a rotating chevron. The `published` tag is not
  shown (it is the normal state); other statuses still are. Rows are table rows with the creation time in a
  shrink-wrapped right cell, and the table bleeds `-mx-3` so names line up with the title and times sit on the
  panel's right edge.

## Radii: controls and surfaces

One scalable language of corners, defined in `index.css` and used by the components, not per screen:

| Level | Token | Value | Used by |
| --- | --- | --- | --- |
| Control | `--radius-control` (`rounded-control`) | `min(var(--radius-md), 10px)` = 10px | buttons, button groups, inputs, textareas, selects, input groups, the JSON editor |
| Surface | `rounded-lg` | 16px | dialog, alert dialog, card, layout sections and tabs box, repeater/relation boxes |

- The 10px control radius is the footer buttons' radius, now applied project-wide. Change a level in
  `index.css`, not in a component.
- Controls inside a surface differ on purpose (10 inside 16): a control as round as its container looks like a
  pill. The number input's spin buttons use `calc(var(--radius-control) - 1px)` so they follow the field's corner.
- The scale comments in `index.css` now state the real values (`--radius` is 0.875rem: sm 12, md 14, lg 16,
  xl 18).

## Relation fields

### Identity: avatar (opt-in)

By default a relation shows nothing next to its display name. A field can opt in from the content type
settings (relation field, avatar selector, always visible and disabled with a hint when unavailable):

1. an **image** branch of the target seed (`avatarSource`), then
2. the **initials** of the display name, then
3. the **last two characters of the id**.

`avatarSource` is validated when seeds load (a fatal check: it must be an image media branch of the target).
It is a property of the **field in the content type**, not of an individual entry, so the entry editor has no
control for it. The list endpoint returns `relationAvatars` alongside `relations`, and the dashboard primes
its cache with the avatar URLs.

### Search by display name

The toolbar search works when the seed's display name is a relation: it searches the **target's display name**
only, through `IN (SELECT id FROM target WHERE col LIKE ? ESCAPE '\')` with escaped wildcards and the target's
active condition. `resolveSearchSupport` returns `fts`, `relation` or `none`; when search does not apply the
search icon is **disabled, not removed** from the toolbar.

### Multi-relation editor

For `multiple: true` relations:

- A scroll area (Radix `ScrollArea`, vertical only, with a defined border) capped at 3 rows, plus an **Add**
  button (a real button) below.
- Rows have a drag grip (six dots), the avatar when enabled (in the scroll area, **not** in the picker), and a
  red X that shows on hover, inset 5px so it does not end under the scrollbar.
- The "N selected" counter sits on the label row, right-aligned, at the same height as the field label.
- In the list views a multi-relation with avatars renders as stacked avatars with a tooltip showing the display
  name, the same pattern as the permission badges on roles (`useHoverPopover`).

## Drag and drop in depth

This is the part to reuse: the same shape works for any nested, sortable structure edited in a dialog. The engine
is shared with the dashboard builder (`src/components/builder/`: `layout-dnd.ts`, `use-layout-dnd.ts`,
`column-shell.tsx`, `section-shell.tsx`); `use-builder-dnd.ts` is the entry builder's **adapter**: it tells the
engine how a form layout is shaped and what the entry rules are.

### One `DndContext`, four kinds of drag

Everything (tabs, sections, columns, fields) lives under a single `DndContext` in `builder-pane.tsx`. Items are
told apart by their **id prefix**, never by where they render:

| Kind | Id | Lands on |
| --- | --- | --- |
| `tab` | `tab:<tab>` | other tabs |
| `section` | `section:<tab>:<section>` | other sections |
| `column` | `column:<tab>:<section>:<column>` | other columns |
| `field` | `field:<branchId>` | other fields, or a column's `zone` |

- A field's id is its **branch id alone**, not qualified by its container, so it does not depend on where it
  sits. Where a field sits is looked up in the draft (`locateField`), and each field's draggable and droppable
  carry `type`, `rootId` (the tab), `sectionId`, `columnId` in their `data`.
- `makeAccepts('tab', 'field')` says what each kind may land on, so a field never collides with a section or a tab.
- Each column has an invisible `zone` droppable covering its whole body, so a field can be dropped in an empty
  column or below the last field.
- Fields are **draggable + droppable, not sortable**: nothing moves, so there are no positions to compute and no
  `SortableContext` per column. Sections, columns and tabs stay sortable (they do reorder on screen).
- While a field is dragged, sections and columns **disable their own droppable** (an item lands on a field or a
  zone, never on a section): fewer rects to measure and fewer candidates per pass.

### Collision detection: cheap and predictable

`createCollisionDetection` does four things, in order:

1. **Filter** the droppables to what the dragged kind accepts. The result is cached in a `WeakMap` keyed by the
   list dnd-kit passes in; that list is only rebuilt when droppables mount, unmount or toggle, not on pointer
   moves, so the filtering runs once per kind instead of on every move and a stale entry cannot outlive its list.
2. Use `pointerWithin`: whatever is under the pointer. If several overlap, a **field wins over the column
   zone** that surrounds it (that is what makes insertion between two fields precise).
3. Over a zone but not over one of its fields, the **nearest field of that column** decides.
4. With no pointer (keyboard) or no hit, fall back to `closestCenter` on the accepted droppables.

### Drop-only moves

- On `onDragStart`: build the preview. Nothing is snapshotted: the draft does not change.
- On `onDragMove`: compute the target (column and index). Over a field, the index is that field's, plus one when
  the dragged item's centre is in its lower half. Over a zone, the index is the end of the column. The target is
  kept in a ref (read at the drop) and in state, but state is set **only when it changes**, so the page redraws
  when the marker moves, not on every pointer move.
- On `onDragEnd`: finish per kind. A field in its own column is reordered (an index after the dragged field counts
  one place further than where it ends up); in another column it goes through `ops.moveField`, which returns
  `false` when a rule refuses (one toast, with the label from `getFullWidthWarningLabel`). Sections and columns
  only reorder within their parent (a cross-tab section drop shows `warnNoCrossTabSection`). Reordering tabs
  must not change which tab is open.
- `onDragCancel` (`Esc`) clears the target and nothing else.

Why drop-only and not live: a live move re-rendered every block and made dnd-kit re-measure every droppable, more
than once per move; that was the cost of the builder. A marker costs one small redraw per target change. The price
is that the user sees where the field will land, not the finished result.

### The overlay

- `DragPreview` draws the **real item** at the width of what was grabbed (`active.rect.current.initial.width`):
  `FieldPreview`, `SectionPreview` (all columns with their fields), a column, a tab chip. A generic chip was
  rejected because it did not look like what was being moved.
- It is rendered through `createPortal(..., document.body)`. Do not move it inside the dialog (see invariants).
- The dragged original stays in place at reduced opacity, the overlay carries the visible copy.
- `dropAnimation` is short (180ms) and eased; keep it short, a long one makes the drop feel late.

### Telling the UI a drag is happening

Two channels, kept apart on purpose:

- **`BuilderDragContext`** (`draggingItem`, `activeColumnKey`, `dropIndex`): a small context memoised on those
  three primitives, so consumers are redrawn when the drop target changes and not on every pointer move. Columns
  read it to outline themselves, tint the active one and draw the marker; sections read it to disable their
  droppable (and to ease their height at the drop). Because it is a context, no props are threaded through
  `SectionCard` and `ColumnCard`.
- **`onDraggingChange`** to the host (`schema-form-shell`): used only to stop `Esc` from closing the dialog.
  The footer derives `isDragging` from `dnd.preview !== null`, so it freezes for a drag of **any** kind.

### Performance rules

dnd-kit redraws the draggables and droppables **when the drop target changes** and after droppables are
re-measured; it does not redraw them on every pointer move, and a drop-only drag asks for no re-measure while the
pointer moves. What is left is kept cheap:

- `FieldBlock` and `FieldGhost` are `React.memo`; their `branch` prop keeps its identity (it comes from the
  seed), so a block re-renders only when its own field changes. What a field redraws on its own is its box.
- **Stable inputs for memoised blocks.** `useLayoutBuilder` returns an `actions` object that does not change
  while the draft does (`ColumnCard`, `SectionCard`, `FieldItem` take it instead of the whole result), and
  `mutate` runs the edited clone through `shareStructure`, which hands back the old object for every tab,
  section and column that did not change. Moves that must validate against the draft (`moveField`,
  `assignField`) read it from a ref, so they do not depend on it. `SectionCard` and `ColumnCard` are `React.memo`.
- `getAvailableBranches()` keeps its identity while fields only move around (it is keyed on the sorted set of
  placed ids), so no column's "Add field" list is rebuilt by a move.
- The "Add field" list (one item per free branch, in every column) and the section menu are **memoised
  components** apart from the column and the section, so the redraws a drag causes do not rebuild them.
- Nothing in the drag path reads layout (`offsetHeight`, `getBoundingClientRect`) per move.
- Drag handlers are `useCallback`s over `draft`; the expensive work (filtering droppables) is cached as above.
- The draft is not persisted mid-drag (the layout does not change then; a drop is persisted by the normal timer).

### Section height at the drop

See "Drag and drop" above. `useAnimatedSectionHeight(dragging, enabled)` reads the section's height once when
`draggingItem` turns on and, when it turns off, animates from that height to the current one with
`element.animate()` if they differ. The earlier hook locked every section's height for the whole drag (and grew it
with a `ResizeObserver`), because a live move shrank the section the field left; with drop-only there is nothing
to hold. Shrinking when the pointer leaves a section, and a grace period before shrinking, were both tried with
live moves and rejected.

## UI principles and simplifications

These are the decisions to carry into similar editors.

**Fewer boxes.** Every border has to earn its place. A column has no outline at rest; the section's own border
is the only frame. A column is outlined only when it is empty (so there is somewhere to click) or when a field is
being dragged (so there is somewhere to drop). Ghosts have no wrapper cards. A text field is one bordered box
with one skeleton, never a box inside a box.

**Draw the real thing, inert.** Ghosts use real controls at real size, disabled, with skeletons for content, so
the layout editor shows the form the user will get. Heavy editors are never mounted; only their footprint is
reproduced. Skeletons vary (random text width) so a long form does not look stamped.

**Neutral by default, no accent for state.** Selection and drop targets use `muted` and `foreground/<alpha>`,
not the primary colour: selected tab, active column, highlighted drop. Accent colour stays for primary actions.

**Recover instead of ask.** The discard-changes dialog and the "your changes were restored" notice were
removed. Work in progress survives a reload and reopens the builder directly; leaving on purpose throws it away.
One mechanism replaces two dialogs.

**Disable, do not remove.** Controls that do not apply stay in place and disabled (the search icon, Save when
nothing changed, the edit-layout icon while editing, Delete on the last tab): the layout does not jump and the
user learns the control exists.

**Freeze what a drag could break.** While dragging, anything that would act on a half-moved state is disabled
(footer), and `Esc` belongs to the drag.

**One style per row of controls.** Footer buttons share variant, weight and radius; the icon-only Back button is
set apart in its own `ButtonGroup`, not given a different colour. Two corner levels only, control and surface,
as tokens (see "Radii: controls and surfaces").

**Say nothing about the normal state.** A tag exists for what is unusual: `published` is not shown, a draft is.

**Hide the wait, do not decorate it.** Dialogs fade in and the content fades in over its skeleton; the fade is
what covers the load, not a spinner.

**Menus for secondary actions, direct manipulation for primary ones.** Double click renames, right click opens
the menu, hover reveals the destructive X. No permanent "..." buttons. Toggles inside a menu keep it open;
a choice that ends a task closes it.

**Small, reversible shortcuts.** Skipping the confirmation for an empty section is safe because nothing is lost;
anything that holds content still asks.

**Animate only what removes a jump.** Section height, the tab X, the dialog's height between form and builder,
panels opening and the dialog's fade use short eased transitions (150-200ms) and respect reduced motion;
nothing animates for decoration. Animate the element that really owns the size (check `flex-basis`).

### Reusing this elsewhere

To build another nested drag editor (the dashboard builder is the worked example: see [Dashboard Builder](./dashboard-builder.md)):

1. Write an adapter for `useLayoutDnd`: id prefixes per kind (`makeDragIds`, `makeAccepts`), how to locate an
   item, move or reorder it, and the message a refused move gives. Keep ids stable across containers.
2. Use `createCollisionDetection` (filter, `pointerWithin`, specific item beats its container, nearest item of
   the column, `closestCenter` fallback), cached by the droppable list.
3. Do not move anything while dragging: compute a target, draw a marker that takes no room, move once at the
   drop, report refused moves once, at the drop.
4. Build the frames from `SectionShell` and `ColumnShell`; share the "something is being dragged" state through
   `BuilderDragContext` and expose a boolean for the host to freeze `Esc` and the footer.
5. Memoise the heavy leaves and give them stable props (`actions`, `shareStructure`, a draft ref) before touching
   anything else.
6. Portal the overlay to `document.body`, render the real item, size it from `active.rect.current.initial`.
7. If the host is as tall as its content and centred, turn on `animateHeight` on the section.
8. Wrap `createDraftStorage` for the draft and keep it out of storage during the drag.

## Invariants (do not change without a new decision)

| Area | Invariant | Reason |
| --- | --- | --- |
| Drag preview | Portal on `document.body` | A transformed dialog offsets `position: fixed` |
| Drag | The draft is not touched until the drop; a marker shows the target and takes no room | Every live move redrew the page and re-measured every droppable |
| Section height | Not touched during a drag; eased from the pick-up height to the new one at the drop | A centred, content-tall dialog recentres when two sections change in one frame |
| Footer | Disabled while dragging; Back only closes | No half-moved saves; recovery replaces the discard dialog |
| Draft | `sessionStorage`, cleared on exit, not on reload | Exit is not an interruption |
| Drop areas | Thin, continuous, grey, no accent | Product decision |
| Ghosts | Bordered box with one skeleton; random text width 30-80% | Two nested ghosts looked wrong; variety per seed |
| Menus | Toggles and column counts keep the menu open | Setting several flags in a row |
| Radii | Controls `rounded-control` (10px), surfaces `rounded-lg` (16px); tokens in `index.css` | One language; a control as round as its surface looks like a pill |
| Dialog height | The animated wrapper is not `flex-1`; content that settles late is re-measured | `flex-basis` beats `height` |
| Builder body | No `space-*`/`gap-*` on the node that holds `DndContext`'s own elements | They added 16px after mounting |
| Referenced by | Starts closed after every builder round trip | The form stays mounted, hidden |
| Labels | Tab 15 / section 50, enforced by the API with 422, trimmed on save | Anything longer is not from the dashboard |
| Avatar | Opt-in per field, never in the entry editor | It is a content-type setting |
| Search | Relation display name only; icon disabled when unsupported | Correct behaviour over a hidden control |

## Known open points

- Surfaces not listed under "Radii" (popovers, dropdowns, sidebar inset, sheets) still use their own radius;
  moving them to `rounded-lg` would finish the pass.
- Inputs inside portalled popovers get the control radius like any other, but nobody has looked at every one.
- The column drag handle's long-term fate (keep, remove, or move to the column's side edge) is undecided.
