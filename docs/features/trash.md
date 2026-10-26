---
title: Trash, Soft Delete & GDPR Purge
description: Reversible deletion, the Trash view, retention windows, and an append-only R2 erasure ledger that survives a database restore.
---

# Trash, Soft Delete & GDPR Purge

A `DELETE` on a content entry never erases it: it is a reversible move to the **Trash**, on every Seed. Irreversible erasure is reserved for an explicit, permission-gated **purge** that only acts on an entry already in the Trash, and is recorded in an append-only ledger stored *outside* the database.

There is nothing to enable: the `softDelete` Seed flag is deprecated and ignored.

---

## Key Capabilities

- **Reversible delete**: `DELETE /api/content/:seed/:id` stamps `deleted_at` instead of dropping the row. Junction rows, pending drafts, and R2 media are left untouched, so a restore brings the entry back whole.
- **One chokepoint, not N**: the `deleted_at IS NULL` predicate is compiled by the engine's single SQL compiler (`buildSelectQuery`). The dashboard list, the Public API, single reads, relation expansion, and relation subqueries are all filtered at once — there is no handler that can forget it.
- **Slug release**: trashing renames the slug to `<slug>_old_<ms>` (the deletion time in milliseconds), and uniqueness is carried by a *partial* unique index (`WHERE deleted_at IS NULL`), so the slug is free for reuse. Restoring brings the original slug back; if it was taken in the meantime the entry is restored as `<slug>-restored-<id8>` rather than failing.
- **Irreversible purge**: `?purge=true` (or the Trash's *Delete forever*) acts only on an entry already in the Trash. It drops the row, cascades junction and draft rows, deletes attached R2 media, and appends an erasure event to the deletion ledger.
- **The ledger outlives D1**: erasure events are written to Cloudflare R2, one immutable object per event. A D1 Time Travel restore rewinds every table it wrote — including any ledger that lived there. The R2 log is the sole source of truth for "this was erased".
- **Reconciliation**: an operator route replays the ledger against a restored database and re-erases anything a restore resurrected.
- **Retention is enforced**: a sweep on the cron purges trashed entries past their retention. The default is 14 days, a Seed's `retentionDays` overrides it, and `0` means never purge — see [Retention](#retention-windows).

---

## The Deprecated `softDelete` Flag

Every Seed has a Trash. `softDelete` is still accepted on a Seed definition so existing definitions keep type-checking and validating, but nothing reads it: toggling or omitting it is never a definition change and never manifest drift.

```typescript
import { defineSeed } from '@beechcms/core'

export const OrderSeed = defineSeed({
  slug: 'orders',
  label: 'Order',
  labelPlural: 'Orders',
  displayNameAlias: 'reference',
  retentionDays: 30,  // [!code highlight] optional: overrides the global retention; 0 = never purge
  branches: [
    { alias: 'reference', type: 'text', requiredOnCreate: true },
    { alias: 'total', type: 'number' },
  ],
})
```

### What the engine provisions

| Artifact | Emitted when | Shape |
| :--- | :--- | :--- |
| `deleted_at` column | Always | `deleted_at INTEGER` — nullable, **no default**. `NULL` means live; a row is never implicitly trashed. |
| `idx_{slug}_deleted_at` | Always | B-tree index on `deleted_at`. |
| `idx_{slug}_slug_active` | Always | `CREATE UNIQUE INDEX … ON content_{slug}(slug) WHERE deleted_at IS NULL` — uniqueness among **live** rows only. |
| Inline `slug … UNIQUE` | **Never** on newly created tables | Replaced by the partial index above. |

`deleted_at` is a **system column** (`SYSTEM_COLUMNS`), addressed by name the same way `status` and `created_at` are. No branch may use that alias.

A table that predates universal soft delete goes through the additive-evolution path (`planExtendSeed`), which emits `generateEnableSoftDelete()` whenever `deleted_at` is missing:

```sql
ALTER TABLE content_orders ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON content_orders(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_slug_active ON content_orders(slug) WHERE deleted_at IS NULL;
```

> [!NOTE]
> **Legacy tables keep their inline slug `UNIQUE`.** A table materialized before universal soft delete carries `slug TEXT NOT NULL UNIQUE`, which SQLite implements as a `sqlite_autoindex` that no `ALTER TABLE` can drop. The `<slug>_old_<ms>` rename removes the reserved-slug problem anyway: a trashed row no longer holds the live slug, so re-creating an entry under it works on those tables too.

---

## Deletion Semantics

| Operation | `deleted_at` | Junction / draft rows | R2 media | Ledger event | Lifecycle hooks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Delete** (`DELETE`) | set from the repository clock; slug renamed to `<slug>_old_<ms>` | untouched | untouched | — | `beforeDelete` / `afterDelete` |
| **Restore** (`POST …/restore`) | cleared to `NULL`; original slug put back | untouched | untouched | — | none (a restore is not a delete) |
| **Purge** (`?purge=true`, *Delete forever*, bulk purge) — **from the Trash only** | row dropped | cascaded via `ON DELETE CASCADE` | deleted | appended | `beforeDelete` / `afterDelete` |

No deletion path is hook-exempt: bulk restore and bulk purge loop per entry precisely so a hook-based integration (webhook, search index, counter) never silently desynchronizes.

### Read visibility

Reads default to **active only**, so a caller that forgets the option can never observe a trashed row. `SelectOptions.trashed` opts out:

| `trashed` | Predicate | Used by |
| :--- | :--- | :--- |
| `'active'` (default) | `deleted_at IS NULL` | Every dashboard and Public API read |
| `'trashed'` | `deleted_at IS NOT NULL` | The Trash listing |
| `'any'` | none | Restore / purge lookups, reconciliation |

The same guard is applied to the repository's non-compiled reads — `findById`, `findBySlug`, `existsSlug`, `getFacets`, `bulkUpdate` — and `findParentIdsByRelation` joins back to the parent table so a relation subquery can never surface the id of a trashed parent.

`deleted_at` reaches the wire **only when it is non-null**, so an active-row payload (Public API and client SDK included) is unchanged.

---

## The Deletion Ledger

A purge writes one immutable JSON object per erasure to R2, under the reserved prefix `_deletion-ledger/{seedSlug}/{entryId}.json`:

```json
{
  "seedSlug": "orders",
  "entryId": "550e8400-e29b-41d4-a716-446655440000",
  "entrySlug": "ord-2026-0042",
  "purgedAt": 1789000000,
  "actorId": "usr_01HXYZ",
  "reason": "purge"
}
```

| Field | Meaning |
| :--- | :--- |
| `entryId` | The identity, and the reconciliation key against a restored `content_{slug}` row. |
| `entrySlug` | Diagnostic only — `entryId` is the identity. |
| `purgedAt` | Unix seconds. |
| `actorId` | Who ordered the purge. `null` for a system or reconciliation purge. |
| `reason` | `'purge'` for an operator action, `'reconcile'` for an erasure re-applied after a restore. |

Design notes:

- **R2, never D1.** The guarantee "an erasure stays erased" is only worth something if it survives a restore of the database that recorded it. A `deletion_ledger` table would be rewound by the very Time Travel restore it exists to defend against.
- **One object per event, written with `put` and never mutated.** R2 has no append primitive; immutable objects are strictly stronger than a mutable JSONL blob, since no event can overwrite another and `list()` is a native prefix listing.
- **The write is awaited and never swallowed.** A purge that reported success without a durable ledger entry is exactly the failure this feature prevents, so a ledger failure surfaces as a failed request.

> [!IMPORTANT]
> The ledger is append-only **evidence of erasure**, never a recovery source. It records that an entry was erased and by whom; it does not store the entry's content.

---

## Reconciliation After a Restore

`POST /api/content/:seed/trash/reconcile` replays the ledger for one Seed and re-erases anything still present in D1:

```bash
curl -X POST "https://api.yourdomain.com/api/content/orders/trash/reconcile?limit=100" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

```json
{ "scanned": 100, "repurged": ["550e8400-e29b-41d4-a716-446655440000"], "nextCursor": "..." }
```

The external log is the only source of truth: an id present in the ledger was erased, so finding its row in D1 means a restore resurrected it. The route re-erases; it never reconciles in the other direction. An entry already absent is the expected case on a database that was never restored, and is skipped silently.

Reconcile is an **operator / compliance action**, not an editor action — it is permission-gated (`content:delete`) and deliberately has **no dashboard UI**. Page through the ledger with `?limit` (default `100`, max `500`) and `?cursor` from the previous response's `nextCursor`.

---

## Retention Windows

A trashed entry is kept for its **effective retention** and then purged by a sweep. The effective value is resolved in this order:

1. The Seed's `retentionDays`, when set. `0` means *never purge* for that Seed.
2. Otherwise the global `trashRetentionDays` site setting. It defaults to **14** and `0` means *never purge*.

`trashRetentionDays` is an integer `0..36500` on `GET /api/settings` and `PUT /api/settings` (`manage_users`, global scope). A malformed value is refused with `400 settings-invalid-trash-retention` and nothing is stored; `null` is refused too, because there is no "reset to default" value.

### The sweep

The sweep runs inside the existing Cron Trigger, every 5 minutes:

- At most **25** purges are attempted per run, across all Seeds, oldest deletion first.
- Every purge goes through the same path as *Delete forever*: the ledger event is written first, with `actorId: null` to mark a system purge, then the row is deleted.
- R2 media cleanup is non-blocking. A failure leaves orphaned files, never a failed purge.
- No lifecycle hooks, automations or activity-log entries run: they already fired when the entry was trashed.
- An entry restored or purged by a user between the query and the purge is skipped silently.
- If the site settings cannot be read, the run purges nothing. It never falls back to the default, so a transient error cannot erase entries an admin chose to keep.
- With no storage configured the ledger cannot be written, so every purge fails and the rows stay in the Trash.

### What the Trash shows

`GET /api/content/:seed/trash` returns the effective `retentionDays` for that Seed next to `items`, `total`, `page` and `limit`. `0` means never purge.

---

## Dashboard Experience

On every Seed:

1. **Trash button** appears in the content list header.
2. **Single delete is instant.** There is no dialog. The row disappears at once, and a 5-second toast offers **Undo**, which calls restore. The toast has no Undo without `content:update`. Each deletion has its own toast.
3. **Bulk delete** asks for confirmation, has no undo, and reports per-id failures, keeping the failed ids for a retry. The permanent-deletion warning is the Trash's *Delete forever* path.
4. **Trash view** (`/content/:slug/trash`) lists trashed entries newest-first with the display name, the slug the entry will get back on restore, deletion time, and retention countdown. The countdown uses the trash list's effective `retentionDays`, and `0` shows "Kept indefinitely". Entries are not editable there.
5. **Settings → Site → Trash** sets the global `trashRetentionDays` (requires `manage_users` global). The per-seed override is set in the seed manifest / `PUT /api/seeds/:slug`, not in the Seed Builder.
6. **Per-row and bulk actions**: **Restore** acts immediately (it is reversible — a confirmation would be friction); **Delete forever** always requires an explicit confirmation stating the action is permanent, that attached media are deleted, and that the erasure is recorded so the entry stays deleted even after a database restore.
7. **Auto-rename is surfaced**: when a restore returns a different slug because the original was reassigned, the UI says so instead of letting the slug change silently.
8. **Partial bulk failures are reported**: a batch where some ids failed never shows as a clean success.
9. **Permission gating**: Restore requires `content:update`, Delete forever requires `content:delete`. Unavailable actions are rendered disabled, never hidden-and-clickable — and the server gate is the real enforcement.

---

## API Endpoints

Full request/response contracts, including error tables, live in the [Internal Content API reference](/reference/internal-content#trash-and-purge).

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `DELETE` | `/api/content/:seed/:id` | `content:delete` | Moves the entry to the Trash. |
| `DELETE` | `/api/content/:seed/:id?purge=true` | `content:delete` | Erases an entry already in the Trash; `404` on a live entry. |
| `GET` | `/api/content/:seed/trash` | `content:read` | Paginated trashed entries, `deleted_at DESC`. |
| `POST` | `/api/content/:seed/:id/restore` | `content:update` | Restores one entry, auto-renaming on slug conflict. |
| `POST` | `/api/content/:seed/trash/bulk-restore` | `content:update` | Restores up to 500 ids, per-id outcomes. |
| `POST` | `/api/content/:seed/trash/bulk-purge` | `content:delete` | Erases up to 500 ids, per-id outcomes. |
| `POST` | `/api/content/:seed/trash/reconcile` | `content:delete` | Replays the ledger and re-erases resurrected rows. |

---

## Scope & Limitations

- **Content entries only.** Soft delete applies to `content_*` instances. Seed deletion has its own, separate soft/hard lifecycle — see [Danger Zone Operations](/build/schema-modeling#danger-zone-operations).
- **No cross-seed Trash.** The Trash is per Seed; there is no global bin, no sidebar entry, and no "Empty trash" / "Restore all" affordance.
- **No server-side search or sorting on the Trash listing.** The endpoint offers `page` / `limit` and a fixed `deleted_at DESC` order.
- **Kanban and gallery views are unchanged.** Both read the active list, which already excludes trashed rows at the engine chokepoint.
- **No MCP content-manipulation tools** for trash, restore, or purge.
- **Legacy tables keep their inline slug `UNIQUE`** — see the note in [The Deprecated `softDelete` Flag](#the-deprecated-softdelete-flag).
