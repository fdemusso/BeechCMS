---
title: Trash, Soft Delete & GDPR Purge
description: Reversible deletion, the Trash view, retention windows, and an append-only R2 erasure ledger that survives a database restore.
---

# Trash, Soft Delete & GDPR Purge

By default a `DELETE` on a content entry is a physical `DELETE FROM` — one mis-click on an order, a customer, or a lead is unrecoverable. Enabling **soft delete** on a Seed turns that same call into a reversible move to the **Trash**, and reserves irreversible erasure for an explicit, permission-gated **purge** that is recorded in an append-only ledger stored *outside* the database.

The feature is opt-in per Seed (`softDelete: true`). A Seed that does not opt in behaves exactly as before: the emitted DDL, the compiled SQL, and every API payload are byte-identical.

---

## Key Capabilities

- **Reversible delete**: `DELETE /api/content/:seed/:id` stamps `deleted_at` instead of dropping the row. Junction rows, pending drafts, and R2 media are left untouched, so a restore brings the entry back whole.
- **One chokepoint, not N**: the `deleted_at IS NULL` predicate is compiled by the engine's single SQL compiler (`buildSelectQuery`). The dashboard list, the Public API, single reads, relation expansion, and relation subqueries are all filtered at once — there is no handler that can forget it.
- **Slug release**: on a table created with `softDelete: true`, uniqueness is carried by a *partial* unique index (`WHERE deleted_at IS NULL`), so trashing an entry frees its slug for reuse. Restoring an entry whose slug was taken auto-renames it rather than failing.
- **Irreversible purge**: `?purge=true` (or the Trash's *Delete forever*) drops the row, cascades junction and draft rows, deletes attached R2 media, and appends an erasure event to the deletion ledger.
- **The ledger outlives D1**: erasure events are written to Cloudflare R2, one immutable object per event. A D1 Time Travel restore rewinds every table it wrote — including any ledger that lived there. The R2 log is the sole source of truth for "this was erased".
- **Reconciliation**: an operator route replays the ledger against a restored database and re-erases anything a restore resurrected.
- **Retention as an interface, not a job**: `retentionDays` drives a countdown in the Trash and a pure `findExpiredByRetention` query. Nothing deletes anything on a timer — see [Retention](#retention-windows).

---

## Enabling the Trash on a Seed

Set `softDelete: true` in the Seed definition (or in `beech.schema.ts`):

```typescript
import { defineSeed } from '@beechcms/core'

export const OrderSeed = defineSeed({
  slug: 'orders',
  label: 'Order',
  labelPlural: 'Orders',
  displayNameAlias: 'reference',
  softDelete: true,   // [!code highlight]
  retentionDays: 30,  // [!code highlight] optional: drives the countdown shown in the Trash
  branches: [
    { alias: 'reference', type: 'text', requiredOnCreate: true },
    { alias: 'total', type: 'number' },
  ],
})
```

The flag is a **Seed contract field**, not a dashboard setting: it is not exposed in the Seed Builder UI. Set it in the manifest or the seed definition and apply it through the normal schema workflow (`beech schema plan` / `beech schema apply`, or `PUT /api/seeds/:slug`).

`softDelete` is part of `SEED_FLAGS` in the CLI's manifest comparison, so `beech schema diff` reports it as drift when the manifest and D1 disagree.

### What the engine provisions

| Artifact | Emitted when | Shape |
| :--- | :--- | :--- |
| `deleted_at` column | Always, for a soft-delete Seed | `deleted_at INTEGER` — nullable, **no default**. `NULL` means live; a row is never implicitly trashed. |
| `idx_{slug}_deleted_at` | Always | B-tree index on `deleted_at`. |
| `idx_{slug}_slug_active` | Always | `CREATE UNIQUE INDEX … ON content_{slug}(slug) WHERE deleted_at IS NULL` — uniqueness among **live** rows only. |
| Inline `slug … UNIQUE` | **Dropped** on tables created with `softDelete: true` | Replaced by the partial index above. |

`deleted_at` is a **system column** (`SYSTEM_COLUMNS`), addressed by name the same way `status` and `created_at` are. No branch may use that alias, and it is only a valid filter target on a Seed that opted in.

Enabling the flag on a Seed whose table already exists goes through the additive-evolution path (`planExtendSeed`), which emits `generateEnableSoftDelete()`:

```sql
ALTER TABLE content_orders ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON content_orders(deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_slug_active ON content_orders(slug) WHERE deleted_at IS NULL;
```

> [!WARNING]
> **Legacy tables keep their global slug uniqueness.** A table materialized *before* `softDelete` was enabled carries its original inline `slug TEXT NOT NULL UNIQUE`, which SQLite implements as a `sqlite_autoindex` that no `ALTER TABLE` can drop. On such a table the partial index is redundant and **a trashed slug stays reserved**: re-creating an entry under the same slug fails with `409 content-slug-conflict` until the trashed row is restored or purged. Everything else — trashing, restoring, purging, the ledger, the auto-rename on restore — works normally. The full SQLite table rebuild that would free those slugs is deliberately deferred.

---

## Deletion Semantics

| Operation | `deleted_at` | Junction / draft rows | R2 media | Ledger event | Lifecycle hooks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Soft delete** (`DELETE`, soft-delete Seed) | set to `unixepoch()` | untouched | untouched | — | `beforeDelete` / `afterDelete` |
| **Restore** (`POST …/restore`) | cleared to `NULL` | untouched | untouched | — | none (a restore is not a delete) |
| **Purge** (`?purge=true`, *Delete forever*, bulk purge) | row dropped | cascaded via `ON DELETE CASCADE` | deleted | appended | `beforeDelete` / `afterDelete` |
| **Delete** (Seed without `softDelete`) | row dropped | cascaded | deleted | appended | `beforeDelete` / `afterDelete` |

No deletion path is hook-exempt: bulk restore and bulk purge loop per entry precisely so a hook-based integration (webhook, search index, counter) never silently desynchronizes.

### Read visibility

Reads default to **active only**, so a caller that forgets the option can never observe a trashed row. `SelectOptions.trashed` opts out:

| `trashed` | Predicate | Used by |
| :--- | :--- | :--- |
| `'active'` (default) | `deleted_at IS NULL` | Every dashboard and Public API read |
| `'trashed'` | `deleted_at IS NOT NULL` | The Trash listing |
| `'any'` | none | Restore / purge lookups, reconciliation |

The option is ignored entirely for a Seed without `softDelete`. The same guard is applied to the repository's non-compiled reads — `findById`, `findBySlug`, `existsSlug`, `getFacets`, `bulkUpdate` — and `findParentIdsByRelation` joins back to the parent table so a relation subquery can never surface the id of a trashed parent.

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

`retentionDays` on a Seed defines how long a trashed entry is kept before it is considered expired. Two consumers use it:

1. **The Trash UI** renders a per-row countdown (*"12 days left"*). A Seed with no `retentionDays` shows `—`, never *"0 days left"* — "no policy" and "expires today" must not look alike.
2. **`ContentRepository.findExpiredByRetention(seed, now, limit)`** is a pure query returning the ids of trashed entries where `deleted_at + retentionDays * 86400 <= now`. It reads no clock of its own; the caller supplies `now`.

> [!NOTE]
> **No scheduler is wired up.** `findExpiredByRetention` is currently uncalled: retention is exposed as an interface, not a job. Nothing deletes anything on a timer, client- or server-side — the countdown is informational, and expired entries stay in the Trash until someone purges them. Automating it is a deliberate future step, not an oversight.

---

## Dashboard Experience

On a Seed with `softDelete: true`:

1. **Trash button** appears in the content list header (hidden entirely on Seeds without the flag).
2. **Delete dialog copy follows the Seed's policy**: *"Move to Trash — you can restore it later"* on a soft-delete Seed, versus the permanent-deletion warning on every other Seed.
3. **Trash view** (`/content/:slug/trash`) lists trashed entries newest-first with the display name, slug, deletion time, and retention countdown. Entries are not editable there.
4. **Per-row and bulk actions**: **Restore** acts immediately (it is reversible — a confirmation would be friction); **Delete forever** always requires an explicit confirmation stating the action is permanent, that attached media are deleted, and that the erasure is recorded so the entry stays deleted even after a database restore.
5. **Auto-rename is surfaced**: when a restore returns a different slug because the original was reassigned, the UI says so instead of letting the slug change silently.
6. **Partial bulk failures are reported**: a batch where some ids failed never shows as a clean success.
7. **Permission gating**: Restore requires `content:update`, Delete forever requires `content:delete`. Unavailable actions are rendered disabled, never hidden-and-clickable — and the server gate is the real enforcement.

Visiting the Trash route on a Seed without `softDelete` renders an explanatory empty state and fires **no** request, since the endpoint answers `409`.

---

## API Endpoints

Full request/response contracts, including error tables, live in the [Internal Content API reference](/reference/internal-content#trash-and-purge).

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `DELETE` | `/api/content/:seed/:id` | `content:delete` | Soft-deletes on a soft-delete Seed; erases otherwise. |
| `DELETE` | `/api/content/:seed/:id?purge=true` | `content:delete` | Forces the irreversible path. |
| `GET` | `/api/content/:seed/trash` | `content:read` | Paginated trashed entries, `deleted_at DESC`. |
| `POST` | `/api/content/:seed/:id/restore` | `content:update` | Restores one entry, auto-renaming on slug conflict. |
| `POST` | `/api/content/:seed/trash/bulk-restore` | `content:update` | Restores up to 500 ids, per-id outcomes. |
| `POST` | `/api/content/:seed/trash/bulk-purge` | `content:delete` | Erases up to 500 ids, per-id outcomes. |
| `POST` | `/api/content/:seed/trash/reconcile` | `content:delete` | Replays the ledger and re-erases resurrected rows. |

Every trash route answers `409` (`content-soft-delete-disabled`) on a Seed without `softDelete: true`.

---

## Scope & Limitations

- **Content entries only.** Soft delete applies to `content_*` instances. Seed deletion has its own, separate soft/hard lifecycle — see [Danger Zone Operations](/build/schema-modeling#danger-zone-operations).
- **No cross-seed Trash.** The Trash is per Seed; there is no global bin, no sidebar entry, and no "Empty trash" / "Restore all" affordance.
- **No server-side search or sorting on the Trash listing.** The endpoint offers `page` / `limit` and a fixed `deleted_at DESC` order.
- **Kanban and gallery views are unchanged.** Both read the active list, which already excludes trashed rows at the engine chokepoint.
- **No MCP content-manipulation tools** for trash, restore, or purge.
- **Legacy tables keep global slug uniqueness** — see the warning in [Enabling the Trash on a Seed](#enabling-the-trash-on-a-seed).
