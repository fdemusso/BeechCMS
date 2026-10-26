# ROADMAP — Universal Soft Delete & Trash Retention

Feature brief: `stages/00_ideation/output/feature_brief.md`.
Planned 2026-10-26. Sprints merge in order; each depends on the previous one being merged.

| # | Slug | Status |
|---|------|--------|
| 1 | `UniversalSoftDelete` | **shipped** (`docs/Sprints/UniversalSoftDelete/`, commit `b5d8003f`) |
| 2 | `TrashRetentionSweep` | **planned** (`output/TrashRetentionSweep.md`) |
| 3 | `InstantDeleteUndo` | pending |

---

## 1. `UniversalSoftDelete`

**Goal:** make soft delete the only ordinary deletion path for every seed, and make the `softDelete` seed flag a deprecated no-op.

**Deliverables:**
- `@beechcms/core`: unconditional `deleted_at` DDL, partial unique slug index, active-row predicate and trashed-slug helpers. `ContentRepository.delete` removed. `purge` accepts trashed rows only, unless the caller opts into `'any'`. `softDelete` marked `@deprecated` and never read.
- `apps/api`: `DELETE` always soft-deletes and renames the slug to `<slug>_old_<ms>`. `?purge=true` and bulk purge act only on trashed entries. Restore strips the suffix and falls back to `-restored-<id8>`. The 409 `content-soft-delete-disabled` is gone. Migration `0038` adds `deleted_at` to the content tables created by migrations. Widget reads exclude trashed rows.
- `apps/dashboard`: the three `softDelete` reads are removed (Trash button, delete-dialog default mode, Trash page gating). The Trash shows the original slug.
- Docs: the flag is documented as deprecated and ignored.

**Depends on:** nothing.

## 2. `TrashRetentionSweep`

**Goal:** enforce retention. 14 days by default, set globally in Settings, overridable per seed, with `0` meaning "never purge". A periodic executor purges expired entries through the ledger-first purge path.

**Deliverables (summary):**
- core `retention.ts`: `DEFAULT_TRASH_RETENTION_DAYS`, `MAX_RETENTION_DAYS`, `isValidRetentionDays`, `resolveRetentionDays`.
- Seed `retentionDays` accepts `0`. `findExpiredByRetention(seed, retentionDays, now, limit)` takes the effective value.
- `SiteSettings.trashRetentionDays` on `GET/PUT /api/settings`. Invalid values get 400 `settings-invalid-trash-retention`.
- `runRetentionSweep` (content slice) runs from `scheduled()` every 5 minutes:
  - at most 25 purges per run, isolated per seed and per id;
  - uses a ledger-equipped repository, with non-blocking R2 cleanup.
- The trash list response gains `retentionDays` (the effective value).

**Depends on:** sprint 1. The sweep relies on every seed having `deleted_at` stamped from `IClock`, and on `purge` defaulting to trashed-only.

## 3. `InstantDeleteUndo`

**Goal:** the dashboard delete experience from the brief. Single delete happens instantly with no dialog: the row disappears optimistically and an "Undo" toast stays for 5 seconds, then calls `restore`. Each deletion has its own independent toast. Bulk delete keeps a mandatory confirmation modal, has no undo, and reports per-id results. Settings gets a field for the global retention, and the Trash countdown uses the effective retention.

**Deliverables (summary):** dashboard only.
- Rework `useContentListModals` and the entry-editor delete path, and add the undo-toast flow. Keep the bulk modal.
- Add a `trashRetentionDays` field in the Settings General tab (validated with core `isValidRetentionDays`).
- Switch the Trash countdown (`ContentTrashView.tsx` / `lib/retention.ts`) from `seed.retentionDays` to the trash list's `retentionDays`, and add the field to `TrashListResponse`.

The per-seed override stays a seed contract field (manifest / `PUT /api/seeds/:slug`). Whether the Seed Builder exposes it gets decided when this sprint is planned.

**Depends on:** sprint 2, for `GET/PUT /api/settings` `trashRetentionDays` and the `retentionDays` field in the trash payload. Sprint 1 already makes the Trash reachable on every seed.
