# ROADMAP — Universal Soft Delete & Trash Retention

Feature brief: `stages/00_ideation/output/feature_brief.md`.
Planned 2026-10-26. Sprints merge in order; each depends on the previous one being merged.

| # | Slug | Status |
|---|------|--------|
| 1 | `UniversalSoftDelete` | **planned** (`output/UniversalSoftDelete.md`) |
| 2 | `TrashRetentionSweep` | pending |
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

**Deliverables (summary):** a global retention value in `SiteSettings` with default 14 and validation on the settings API. Seed `retentionDays` accepts `0` and still rejects negative or non-integer values. One core resolver turns seed + global into an effective retention. `findExpiredByRetention` uses the effective value. A bounded retention sweep runs in the existing `scheduled()` cron, per seed and per id, so one failure never stops the run. It reuses the sprint-1 `purge` (ledger first, R2 media cleanup non-blocking). The trash list exposes the effective retention so the countdown is correct.

**Depends on:** sprint 1. The sweep relies on every seed having `deleted_at` stamped from `IClock`, and on `purge` defaulting to trashed-only.

## 3. `InstantDeleteUndo`

**Goal:** the dashboard delete experience from the brief. Single delete happens instantly with no dialog: the row disappears optimistically and an "Undo" toast stays for 5 seconds, then calls `restore`. Each deletion has its own independent toast. Bulk delete keeps a mandatory confirmation modal, has no undo, and reports per-id results. Settings gets a field for the global retention, and the Trash countdown uses the effective retention.

**Deliverables (summary):** dashboard only. Rework `useContentListModals` and the entry-editor delete path, add the undo-toast flow, keep the bulk modal, add a retention field in the Settings tab, and switch the Trash countdown to the effective retention from sprint 2. The per-seed override stays a seed contract field (manifest / `PUT /api/seeds/:slug`). Whether the Seed Builder exposes it gets decided when this sprint is planned.

**Depends on:** sprint 2, for the effective retention in the trash payload and the settings key. Sprint 1 already makes the Trash reachable on every seed.
