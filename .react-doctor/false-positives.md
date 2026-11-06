# React Doctor — False Positives

Diagnostics reviewed and judged not actionable. Each entry names the rule, the file, and why.
Keep entries scoped to one `rule` + `filePath` pair — the triage script matches substrings of
this file against `d.rule` and `d.filePath`, so an entry naming only a bare rule id (e.g.
`react-doctor/only-export-components`) would silently suppress that rule everywhere, not just
the file below. Always pair the rule with its file path on the same line (or nearby) to keep
the match scoped.

## react-doctor/only-export-components

- `apps/dashboard/src/features/content-gallery/gallery-view-renderer.tsx` — exports the
  `GalleryViewRenderer` component together with `GALLERY_VIEW_DEFINITION`, a metadata object
  bundling it per the view harness contract (`ViewDefinition`, see
  `apps/dashboard/src/features/shared/view-registry.ts`). This co-location is the intended
  Sprint 4 architecture across every View Type renderer; splitting the constant into its own
  file to satisfy Fast Refresh would fight the established registry pattern for a dev-only HMR
  fallback, not a functional bug.
- `apps/dashboard/src/features/content-kanban/components/kanban-view-renderer.tsx` — same
  `KANBAN_VIEW_DEFINITION` pattern as above.
- `apps/dashboard/src/features/content-management/components/content-table-renderer.tsx` — same
  `TABLE_VIEW_DEFINITION` pattern as above. (The file's other `only-export-components` warning,
  on the `toTableRowStyles` helper, was a real instance and has been fixed by moving it to
  `table-row-styles.ts`.)
- `apps/dashboard/src/lib/dynamic-columns.tsx` — this file exports zero React components (only
  `generateColumns`, `defaultHiddenColumns`, and re-exported types/utils); it uses `.tsx` only
  because column `header`/`cell` definitions contain inline JSX. There is no component state for
  Fast Refresh to preserve here, so the warning does not apply.

## react-doctor/js-set-map-lookups

- `apps/dashboard/src/lib/password-strength.ts:82` — `normed.includes(tNorm)` is
  `String.prototype.includes` (substring search on a normalized password string), not
  `Array.prototype.includes`. The suggested Set-based O(1) membership fix doesn't apply to
  substring search; the diagnostic appears to be a syntax-level misclassification.

## react-doctor/no-pass-data-to-parent + react-doctor/no-pass-live-state-to-parent

- `apps/dashboard/src/features/content-transfer/components/import-job-panel.tsx:55` — both
  rules' own documented exception applies: `ImportJobPanel` owns a live external subscription
  (`useImportJob`, a polling query with no push channel or cancel endpoint — see its doc comment
  in `apps/dashboard/src/features/content-transfer/hooks/use-import-job.ts`) that its parents
  cannot observe directly. Reporting the terminal job state upward once, via `onCompleted`, is
  the intentional and documented exception case for this pattern, not misplaced state ownership.

## react-doctor/no-array-index-as-key

- `apps/dashboard/src/features/dashboard/builder/ghosts/archetypes.tsx` — the keyed lists are fixed-length
  skeleton rows (`seededSeries(...)` widths, a literal `[0, 1, 2]`) with no identity, no reordering and no
  state: they are redrawn from the widget id, so position is the only identity there is.

## react-doctor/no-transition-all

- `apps/dashboard/src/features/dashboard/builder/dashboard-builder-dialog.tsx:127` — no `transition` utility is
  used; `duration-200` only sets `--tw-duration`, which the `animate-in` / `fade-in-0` keyframe animation
  reads. Removing it would change the open/close animation timing, not narrow a transition.
- `apps/dashboard/src/features/seed-builder/components/SeedFormDialog.tsx` — same pattern: the
  `data-open:duration-[220ms]` / `data-closed:duration-[176ms]` pair only sets `--tw-duration` for the dialog's
  `animate-in` / `animate-out` fade, there is no `transition` utility to narrow.

## react-doctor/no-prop-callback-in-effect

- `apps/dashboard/src/features/dashboard/builder/dashboard-builder-dialog.tsx` — the effect does not mirror
  local state to the parent: it closes the dialog once, when the layout query settles and the draft found
  after a reload turns out to be stale. That outcome is only known after the async fetch, so there is no
  event handler to put it in.
