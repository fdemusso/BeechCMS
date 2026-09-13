# ROADMAP — Soft Delete, Trash & GDPR Purge

Feature brief: `stages/00_ideation/output/feature_brief.md`.

The feature is split into **2 sprints**, not more. The only hard sequential gate is
`@beechcms/core` + `apps/api` (one backend change, validated by one integration suite)
before `apps/dashboard` (pure presentation over a frozen HTTP contract).

Core and the D1 repository are deliberately NOT split: splitting them would land a
`ContentRepository` interface with no implementation — dead contract code that Ponytail's
YAGNI rule rejects, and that no integration test can validate.

---

## Sprint 1 — `SoftDeleteBackend` — ✅ SHIPPED (commit `7b1ca45`, archived in `docs/Sprints/SoftDeleteBackend/`)

**Goal:** an entry of a `softDelete: true` seed can be trashed, listed, restored and
irreversibly purged through the protected API, with a D1-restore-proof deletion ledger
in R2, and with zero possibility of a trashed record leaking through the Public API.

**Deliverables:** `softDelete` flag on `Seed`; `deleted_at` DDL + partial unique slug index;
`SelectOptions.trashed` gate in `buildSelectQuery` (single chokepoint, default = active only);
`softDelete`/`restore`/`purge`/`bulkRestore`/`bulkPurge`/`findExpiredByRetention` on
`ContentRepository` + `D1ContentRepository`; `IDeletionLedger` + `R2DeletionLedger`;
trash/restore/purge/reconcile routes + permission rules; migration + evolution path.

**Depends on:** nothing.

---

## Sprint 2 — `SoftDeleteDashboardTrash` (DETAILED PLAN: `output/SoftDeleteDashboardTrash.md`)

**Goal:** an editor sees, selects and manages the Trash of a seed from the dashboard.

**Deliverables:** Trash view in `apps/dashboard/src/features/content-management/`
(list of trashed entries, `deleted_at` column, retention countdown when `retentionDays`
is set); multi-select reusing the existing bulk-selection idiom; restore / purge-forever
actions (single + bulk) with an irreversibility confirmation on purge; `content-delete-dialog`
copy adapted to say "moved to Trash" vs "deleted forever"; query-key invalidation so the
main list and the Trash stay consistent.

**Depends on:** Sprint 1 — consumes the HTTP contract frozen there
(`GET /api/content/:slug/trash`, `POST /api/content/:slug/:id/restore`,
`POST /api/content/:slug/trash/bulk-restore`, `POST /api/content/:slug/trash/bulk-purge`,
`DELETE /api/content/:slug/:id?purge=true`). Cannot start before those routes exist.

**Contract amendment found while planning Sprint 2:** the frozen contract is not consumable as
shipped. `D1ContentRepository.rowToData` drops `deleted_at` (it hand-picks `id, slug, status,
created_at, updated_at` + branch aliases), so the deletion timestamp and the retention countdown
cannot be rendered; and `trashListHandler` returns repository rows raw, without the `data` envelope
and without `applyVisibility` — so a branch marked `policies.visibility: 'masked' | 'hidden'` is
emitted in the clear on the trash route while being masked on the main list. Sprint 2 therefore
carries a bounded `apps/api` delta (2 files, no new route, no new permission, no schema change):
see its SECTION 4 → T1.

---

## Deferred beyond this feature (NOT a sprint of this roadmap)

- **Legacy table slug rebuild.** A table created BEFORE `softDelete` was enabled carries an
  inline `slug TEXT NOT NULL UNIQUE`, which SQLite materializes as a `sqlite_autoindex` that
  `ALTER TABLE` cannot drop. On such tables a trashed slug is NOT freed for reuse. Fixing it
  needs a full 12-step SQLite table rebuild with FK-referencing junction tables in play —
  real risk, secondary value. See Sprint 1 SECTION 7.
- **Retention scheduler.** Sprint 1 ships `findExpiredByRetention` as a pure query only.
  The cron/adapter belongs to the future recurring-automations initiative (feature brief §5).
- **MCP content-manipulation tools** (`beech_content_delete`, `restore`, …) — future dedicated
  MCP Content CRUD & Operations upgrade (feature brief §5).
