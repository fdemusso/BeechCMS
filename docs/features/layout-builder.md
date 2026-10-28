---
title: Layout Builder & Relation Fields
description: How the entry layout builder, its drag and drop, draft recovery and the relation field identity (avatar, search, multi-relation editor) work, and which behaviours are deliberate.
---

# Layout Builder & Relation Fields

This page records how the entry layout builder (`apps/dashboard/src/features/entry-editor/builder/`) and the
relation field work, and **why** each non-obvious choice was made. The builder is considered finished: most of
what looks like an oversight below is a decision taken after trying the alternative. Read the
[invariants](#invariants-do-not-change-without-a-new-decision) before changing any of it.

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
- The menu is **flush** (`FLUSH_MENU` in `section-card.tsx`): no inner padding, square items and no margin on
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
- `FieldGhost` and `FieldBlock` are memoised: while a drag is in progress every sortable re-renders on each
  pointer move, and re-rendering ghosts is what made it heavy.

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

- Fields move between columns and sections **while the pointer is moving** (the draft is updated on drag over),
  so the target shows the real result. Same-column reordering is finished on drop. `Esc` restores the layout as
  it was when the drag started.
- The drag preview (`DragOverlay`) is rendered in a **portal on `document.body`**: the entry dialog is
  positioned with a CSS transform, which would otherwise become the reference of the overlay's
  `position: fixed` and shift it away from the pointer. The preview draws the real item, not a generic chip.
- **Section heights are stable during a drag** (`use-animated-section-height.ts`): a section keeps the height
  it had when the drag began, grows if its content outgrows it, never shrinks while dragging (whichever section
  the field goes to next), and eases to its real height at the drop. The dialog is as tall as its content and
  vertically centred, so a section shrinking mid-drag moves every target under the pointer. Shrink-on-exit and
  grace-period variants were tried and **rejected**.
- Drag-time cost is kept low: the list of droppables a kind of drag may land on is cached per drag kind (the
  droppable list is stable across pointer moves), and collision detection stops at the first accepted hit.
- A column also has a drag handle (visible on hover, only when a sibling column exists to swap with).

### Footer

`Back` (icon only, in its own group), `Reset` and `Save` are a `ButtonGroup`; all three are `outline`, with
normal font weight and a corner radius capped at 10px (`FOOTER_RADIUS`; `--radius` makes `rounded-lg` 16px,
which turns a 32px button into a pill). **Add section** uses the same radius.

> **Decision: this is the reference style for action rows.** The group structure (icon-only Back set apart,
> then the two actions together), the shared `outline` variant, normal weight and the 10px radius cap are the
> ones to reuse in other dialogs and panes. Copy `FOOTER_RADIUS` and the `--button-group-radius` override on the
> outer group as they are; do not tune them per screen.

- `Back` leaves the builder and discards the draft. There is deliberately **no** "unsaved changes" dialog: the
  draft is recovered instead (see below). Do not bring `handleAttemptClose` or a discard confirmation back.
- All three buttons are disabled **while anything is being dragged**, since a click mid-drag would save, reset
  or close a half-moved layout. At the drop they return to their own rules (`Save` is enabled only when the
  draft differs from what is saved).
- `Esc` does not close the dialog during a drag (it cancels the drag).

### Draft recovery

Unsaved work survives a **reload** (`layout-draft-storage.ts`):

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

This is the part to reuse: the same shape works for any nested, sortable structure edited in a dialog.

### One `DndContext`, four kinds of drag

Everything (tabs, sections, columns, fields) lives under a single `DndContext` in `builder-pane.tsx`; all the
logic is in `use-builder-dnd.ts`. Items are told apart by their **id prefix**, never by where they render:

| Kind | Id | Lands on |
| --- | --- | --- |
| `tab` | `tab:<tab>` | other tabs |
| `section` | `section:<tab>:<section>` | other sections |
| `column` | `column:<tab>:<section>:<column>` | other columns |
| `field` | `field:<branchId>` | other fields, or a column's `zone` |

- A field's id is its **branch id alone**. It must stay the same while the field changes column in the middle
  of a drag, and an id qualified by its container would change. Where a field sits is looked up in the draft
  (`locateField`), and each sortable also carries `type`, `tabId`, `sectionId`, `columnId` in its `data`.
- `ACCEPTS` says what each kind may land on, so a field never collides with a section or a tab.
- Each column has an invisible `zone` droppable covering its whole body, so a field can be dropped in an empty
  column or below the last field.

### Collision detection: cheap and predictable

`builderCollisionDetection` does three things, in order:

1. **Filter** the droppables to what the dragged kind accepts. The result is cached in a `WeakMap` keyed by the
   list dnd-kit passes in; that list is only rebuilt when droppables mount, unmount or toggle, not on pointer
   moves, so the filtering runs once per kind instead of on every move and a stale entry cannot outlive its list.
2. Use `pointerWithin`: whatever is under the pointer. If several overlap, a **field wins over the column
   zone** that surrounds it (that is what makes insertion between two fields precise).
3. With no pointer (keyboard) or no hit, fall back to `closestCenter` on the accepted droppables.

### Live moves between columns

A field is moved **while dragging**, not at the drop:

- On `onDragStart`: snapshot the draft (`structuredClone`) and build the preview.
- On `onDragOver` (dnd-kit fires it only when the `over` target changes, so it is cheap): compute the target
  column and index. Over a field, the index is that field's, plus one when the dragged item's centre is in its
  lower half. Over a zone, the index is the end of the column. Then call `ops.moveField`.
- If the target is **the same column**, do nothing: the sortable already animates it and the drop finishes the
  reorder (`reorderFieldsInColumn`). Do not also move it live.
- `moveField` returns `false` when a layout rule refuses (a full-width field needs a section of its own). The
  field stays where it was, the reason is stored in `rejectedRef`, and **one** toast is shown at the drop, not on
  every pointer move.
- `onDragCancel` (`Esc`) restores the snapshot with `ops.restoreDraft`, which does not touch what counts as
  saved.
- `onDragEnd` finishes per kind. Sections and columns only reorder within their parent (a cross-tab section
  drop shows a warning). Reordering tabs must not change which tab is open.

Why live and not on drop: the target opens a gap and the user sees the real result, instead of guessing from a
line. It costs one extra rule: everything that depends on the draft must tolerate it changing mid-drag.

### The overlay

- `DragPreview` draws the **real item** at the width of what was grabbed (`active.rect.current.initial.width`):
  `FieldPreview`, `SectionPreview` (all columns with their fields), a column, a tab chip. A generic chip was
  rejected because it did not look like what was being moved.
- It is rendered through `createPortal(..., document.body)`. Do not move it inside the dialog (see invariants).
- The dragged original stays in place at reduced opacity, the overlay carries the visible copy.
- `dropAnimation` is short (180ms) and eased; keep it short, a long one makes the drop feel late.

### Telling the UI a drag is happening

Two channels, kept apart on purpose:

- **`BuilderDragContext`** (`draggingField`, `activeColumnKey`): a small context memoised on `preview` and
  `draft`. Columns read it to outline themselves and tint the active one; sections read it to lock their
  height. Because it is a context, no props are threaded through `SectionCard` and `ColumnCard`.
- **`onDraggingChange`** to the host (`schema-form-shell`): used only to stop `Esc` from closing the dialog.
  The footer derives `isDragging` from `dnd.preview !== null`, so it freezes for a drag of **any** kind.

### Performance rules

While something is dragged dnd-kit re-renders **every** `useSortable` consumer on every pointer move. So:

- `FieldBlock` and `FieldGhost` are `React.memo`; their `branch` prop keeps its identity (it comes from the
  seed), so a block re-renders only when its own field changes.
- Nothing in the drag path reads layout (`offsetHeight`, `getBoundingClientRect`) per move. The height lock uses
  a `ResizeObserver`, whose entry already carries the size, and it touches state only when the content actually
  outgrew the section.
- Drag handlers are `useCallback`s over `draft`; the expensive work (filtering droppables) is cached as above.
- The draft is not persisted mid-drag (a field half-way between columns is not a state worth coming back to).

### Stable section heights

`use-animated-section-height.ts`, used by `SectionCard`:

1. When a field drag starts, measure the section and **lock its height** (`overflow: hidden`). Attach
   `outerRef` to the bordered box and `innerRef` to a wrapper around all its content: the wrapper's height is
   the natural height, which the fixed outer height hides. The border is measured once as
   `outer.offsetHeight - inner.offsetHeight`.
2. During the drag the height **only rises**, when the content outgrows it (a field dragged in).
3. At the drop it **eases to the real height** (160ms, 0 with `prefers-reduced-motion`) and then returns to
   `auto` after the transition.

Reason: the dialog is as tall as its content and vertically centred, so any section that shrinks mid-drag moves
every target under the pointer and drags the whole dialog with it. If no section can shrink, neither can the
dialog. Shrinking when the pointer leaves a section, and a grace period before shrinking, were both tried and
rejected: the first made the layout jump, the second only delayed the jump.

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
set apart in its own `ButtonGroup`, not given a different colour. Radii are capped locally rather than changed in
the theme (see invariants).

**Menus for secondary actions, direct manipulation for primary ones.** Double click renames, right click opens
the menu, hover reveals the destructive X. No permanent "..." buttons. Toggles inside a menu keep it open;
a choice that ends a task closes it.

**Small, reversible shortcuts.** Skipping the confirmation for an empty section is safe because nothing is lost;
anything that holds content still asks.

**Animate only what removes a jump.** Section height and the tab X use short eased transitions (150-180ms) and
respect reduced motion; nothing animates for decoration.

### Reusing this elsewhere

To build another nested drag editor (the dashboard builder is the next candidate):

1. Pick id prefixes per kind and an `ACCEPTS` table; keep ids stable across containers where the item can move.
2. Write one collision function: filter, `pointerWithin`, specific item beats its container, `closestCenter`
   fallback; cache the filtering by the droppable list.
3. Snapshot on start, move live on over (skip same-container moves), finish same-container reorder on drop,
   restore on cancel; report refused moves once, at the drop.
4. Share the "something is being dragged" state through a context, and expose a boolean for the host to freeze
   `Esc` and the footer.
5. Memoise the heavy leaves and give them stable props before touching anything else.
6. Portal the overlay to `document.body`, render the real item, size it from `active.rect.current.initial`.
7. Lock container heights while dragging and ease them at the drop.
8. Keep the draft out of storage during the drag and recover it after a reload.

## Invariants (do not change without a new decision)

| Area | Invariant | Reason |
| --- | --- | --- |
| Drag preview | Portal on `document.body` | A transformed dialog offsets `position: fixed` |
| Section height | Only grows during a drag, shrinks at the drop | Shrinking moves targets and the centred dialog |
| Footer | Disabled while dragging; Back only closes | No half-moved saves; recovery replaces the discard dialog |
| Draft | `sessionStorage`, cleared on exit, not on reload | Exit is not an interruption |
| Drop areas | Thin, continuous, grey, no accent | Product decision |
| Ghosts | Bordered box with one skeleton; random text width 30-80% | Two nested ghosts looked wrong; variety per seed |
| Menus | Toggles and column counts keep the menu open | Setting several flags in a row |
| Radii | Footer and Add section cap at 10px; reference style for action rows | `--radius` makes `rounded-lg` 16px |
| Labels | Tab 15 / section 50, enforced by the API with 422, trimmed on save | Anything longer is not from the dashboard |
| Avatar | Opt-in per field, never in the entry editor | It is a content-type setting |
| Search | Relation display name only; icon disabled when unsupported | Correct behaviour over a hidden control |

## Known open points

- `--radius` is 0.875rem while comments in the theme still say 6px; the builder works around it locally.
- The column drag handle's long-term fate (keep, remove, or move to the column's side edge) is undecided.
