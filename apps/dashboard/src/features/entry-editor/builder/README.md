# Layout builder

This folder is finished. Behaviours that look odd are deliberate; the reasons are in
[`docs/features/layout-builder.md`](../../../../../../docs/features/layout-builder.md). Read its
"Invariants" table before changing anything here.

The ones most often broken by mistake:

- `DragOverlay` is portalled to `document.body` (the dialog has a CSS transform).
- Sections never shrink during a drag; they ease to their real height at the drop (`use-animated-section-height.ts`).
- Footer buttons are disabled while dragging; `Back` only closes. No discard dialog: the draft is recovered on reload instead.
- The draft lives in `sessionStorage` and is cleared on exit (unmount), never on reload.
- Drop areas are thin, solid, grey lines; no dashed borders, no accent colour.
- Ghosts: one bordered box with one skeleton, text width random 30-80% per mount; `FieldGhost` and `FieldBlock` stay memoised.
- Section menu toggles and column counts keep the menu open (`event.preventDefault()`); the menu is flush (`FLUSH_MENU`).
- Corners: controls are `rounded-control` (10px), surfaces `rounded-lg` (16px); tokens live in `index.css`.
- Footer buttons are the reference style for action rows (`ButtonGroup`, `outline`, normal weight, 10px radius): reuse, do not retune. The entry dialog's footer matches it.
- No `space-*`/`gap-*` on the node that holds `DndContext`: its own elements join the spacing and the dialog grows after mounting.
- The dialog's animated height wrapper is not `flex-1` (`flex-basis` beats `height`); see "The entry dialog around the builder" in the doc.
- Label limits (tab 15, section 50) come from `@beechcms/core` and are enforced by the API (422); the inputs' `maxLength` is only comfort.
