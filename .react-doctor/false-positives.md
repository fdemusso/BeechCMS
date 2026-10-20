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
