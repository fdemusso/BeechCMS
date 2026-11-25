You are a senior TypeScript engineer working on the Beech CMS monorepo.

## PROJECT CONTEXT

Do NOT explore the codebase further. All relevant context is provided in this prompt.
Read it fully before writing any code.

This is **Sprint 8 of 8** — the final relation sprint. Sprints 1–7 shipped
single + multi relations, validation, draft safety, back-refs, and inline
create. This sprint adds **bulk reassign**: from the content list, select N
entries and update one or more field values in a single operation.

Although the trigger is relations ("change the author of these 47 articles"),
the endpoint is intentionally general — it accepts any subset of fields, so
the same surface can later cover bulk status changes, bulk tag updates, etc.

### Stack

- API: Hono on Cloudflare Workers, D1 (batch transactions).
- Dashboard: list-view selection mode (likely already in place from the
  existing `bulkDelete` feature — verify and reuse).
- Authorization: the same role/capability check that gates per-entry edits.

==========================================================================
SECTION 1 — WHAT THIS SPRINT DELIVERS
==========================================================================

1. New API endpoint:
   ```
   PATCH /content/:slug/bulk
   Body: {
     ids: string[],                       // required, length 1..MAX_BULK_SIZE
     fields: Record<string, unknown>      // required, ≥ 1 alias
   }
   Response: 200 {
     updated: number,                     // count of successfully updated rows
     failed: Array<{ id: string, problem: ProblemJSON }>
   }
   ```
   Atomic per-id (each id either fully updates or fails independently).
   The batch is wrapped in a D1 `batch()` for transactional safety per id.

2. Rate limiting reuses the existing `publicApiWrite` / dashboard write
   limiter — bulk does not get its own bucket. The per-row cost is amortised
   under the existing per-request limit.

3. Dashboard:
   - In selection mode, a new toolbar button "Edit selected" between the
     existing Bulk Delete and Export actions.
   - A Dialog with a field picker (from the seed's editable branches), a
     value editor (using the existing FieldEdit registry — including
     `RelationEdit` for relation fields), and a confirmation step showing
     the count.
   - Optimistic update on success; on partial failure, a toast with a link
     to download a failure report (CSV with id + problem detail).

4. Permissions:
   - Authorization identical to per-entry PUT.
   - If the user lacks edit permission on the seed, the toolbar button is
     hidden.
   - Field-level visibility: any field with `policies.visibility === 'hidden'`
     or `privacy === 'encrypt'` cannot be bulk-edited (excluded from the
     field picker).

5. Hooks for relations specifically:
   - Bulk-editing a single-value relation: replaces the value on every selected
     entry.
   - Bulk-editing a multi-relation (Sprint 5): the dialog offers three modes:
     `replace` (replace the entire array), `add` (union with existing), and
     `remove` (set difference). The API encodes this via a small wrapper type
     on the field value:
     ```ts
     fields: {
       authors: { mode: 'replace', value: ['team-1'] }
       // or { mode: 'add', value: ['team-1', 'team-2'] }
       // or { mode: 'remove', value: ['team-3'] }
     }
     ```
     Single-value fields pass the raw value as today.

==========================================================================
SECTION 2 — LIMITS AND SAFETY
==========================================================================

Top of the new handler:

```ts
const MAX_BULK_SIZE = 500           // hard cap, returns 400 if exceeded
const RECOMMENDED_BATCH_CHUNK = 50  // sub-batch size inside the handler
```

Why two numbers:
- 500 is the user-facing limit (UI prevents selecting more; API rejects beyond
  it with a clear problem).
- 50 is the internal batch size: D1 `batch()` has per-batch statement limits
  and runtime budgets on Workers. Chunk the work into rolling batches of 50,
  with progress accumulation in `updated` and `failed`.

Failures inside a chunk:
- Each id is its own atomic UPDATE inside the batch. If one fails (e.g. FK
  violation on a relation field), it joins `failed[]`; the others in the
  chunk commit. (D1 batch semantics: each statement is independent unless
  wrapped in an explicit transaction; verify this assumption against the
  current D1 docs your repo links to — if `batch()` is all-or-nothing, fall
  back to per-id `prepare().run()` calls.)

==========================================================================
SECTION 3 — STEP-BY-STEP PLAN
==========================================================================

--------------------------------------------------------------------------
STEP 1 — Repository method
File: packages/core/src/content.repository.ts (extend interface)
      apps/api/src/shared/content.repository.d1.ts (implementation)
--------------------------------------------------------------------------

Add to `ContentRepository`:

```ts
/**
 * Apply the same field update to many entries. Returns per-id outcome.
 * Caller is responsible for validation; this method assumes the payload is
 * already shape-checked against the seed.
 */
bulkUpdate(
  seedSlug: string,
  ids: string[],
  fields: Record<string, BulkFieldUpdate>,
): Promise<{ updated: number; failed: Array<{ id: string; reason: string }> }>

type BulkFieldUpdate =
  | { kind: 'set';    value: unknown }              // single + replace
  | { kind: 'array_replace'; value: string[] }      // multi-relation replace
  | { kind: 'array_add';     value: string[] }      // multi-relation add
  | { kind: 'array_remove';  value: string[] }      // multi-relation remove
```

D1 implementation:
- For `set`: per-chunk batch of `UPDATE content_<slug> SET <alias> = ?, updated_at = unixepoch() WHERE id = ?` statements.
- For `array_replace`: per id, `DELETE FROM rel_<slug>_<alias> WHERE parent_id = ?` then bulk INSERT.
- For `array_add`: per id, `INSERT OR IGNORE` rows (composite PK from Sprint 5 handles dedup; assign `position` as `MAX(position)+i` from a sub-select).
- For `array_remove`: per id, `DELETE FROM rel_<slug>_<alias> WHERE parent_id = ? AND target_id IN (...)`.

For any operation that triggers an FK violation (e.g. an `array_add` referencing
a non-existent target), record the failure with `reason = 'relation-target-not-found:<id>'`
and continue.

--------------------------------------------------------------------------
STEP 2 — Handler
File: apps/api/src/features/content/bulk.handler.ts (new)
--------------------------------------------------------------------------

Vertical slice. Registered under the same `/content/:slug` Hono router as
the existing CRUD handlers, just at the new `PATCH /bulk` path.

Logic:

1. AuthZ check (reuse existing `requireSeedEdit(slug)` middleware or the
   nearest equivalent).
2. Parse body. Validate:
   - `ids.length` in `[1, MAX_BULK_SIZE]`.
   - `Object.keys(fields).length >= 1`.
   - Each alias exists on the seed and is not `hidden`/`encrypt`.
   - Each value passes the per-branch Zod schema. For multi-relation values
     wrapped in `{ mode, value }`, validate `mode` enum + value array shape.
3. Rate-limit check — same bucket as regular write endpoints.
4. Call `contentRepository.bulkUpdate(...)`.
5. Return `{ updated, failed }`. For each `failed`, emit a structured problem
   sub-object (status, type, detail) so the dashboard can render a failure
   report.
6. Activity log: emit a single `bulk_update` event with `{ slug, count, fields }`.
   Don't emit one event per id — would flood the log.
7. Invalidate caches by triggering the standard list-cache headers if any.

--------------------------------------------------------------------------
STEP 3 — Frontend hook
File: apps/dashboard/src/features/content-management/api/content.api.ts (extend)
      apps/dashboard/src/features/content-management/hooks/use-bulk-update.ts (new)
--------------------------------------------------------------------------

Add to `contentApi`:

```ts
bulkUpdate: async (slug: string, body: BulkUpdateBody): Promise<BulkUpdateResult> => {
  const response = await api.patch<BulkUpdateResult>(`/content/${slug}/bulk`, body)
  return response.data
}
```

Mutation hook invalidates:
- `CONTENT_QUERY_KEYS.all` (the list)
- `CONTENT_QUERY_KEYS.detail(slug, id)` for each id in the batch
- `['backrefs']` (if any updated field is a relation, the back-refs change)

--------------------------------------------------------------------------
STEP 4 — Bulk-edit Dialog
File: apps/dashboard/src/features/bulk-edit/bulk-edit-dialog.tsx (new)
      apps/dashboard/src/features/bulk-edit/index.ts             (barrel)
      apps/dashboard/src/pages/content-list.tsx                   (mount in toolbar)
--------------------------------------------------------------------------

UX flow inside the dialog:

1. **Step 1 — Field picker**: dropdown of editable branches from the seed,
   excluding `hidden`/`encrypt` and system fields. Multi-select disabled
   for v1: one field per bulk operation. (Extensible later.)
2. **Step 2 — Value editor**:
   - Single-value branch: render via `FieldEdit` from the registry.
   - Multi-relation branch: render a mode selector (`Replace | Add | Remove`)
     plus a `RelationEdit` (multi variant from Sprint 5) configured to skip
     resolving the current per-entry values (it's not editing one entry).
3. **Step 3 — Confirmation**: "This will update {{count}} entries. Continue?"
   with the selected ids count and a list of the first 5 entries' display
   names for sanity-check.
4. **Step 4 — Execution**: progress bar driven by the response.
5. **Step 5 — Result**:
   - All-success: toast + close.
   - Partial: a card listing failed ids with a "Download report" button
     (client-side CSV from the response payload — no extra API call).

Locking: while the dialog is in execution state, navigation away triggers
the standard "unsaved-changes" guard already used by the entry editor.

--------------------------------------------------------------------------
STEP 5 — Selection toolbar integration
File: apps/dashboard/src/pages/content-list.tsx
--------------------------------------------------------------------------

Locate the existing selection-mode toolbar (likely renders when
`Object.keys(rowSelection).length > 0`). Add the "Edit selected" button
between "Bulk Delete" and the rightmost actions. Click → open
`BulkEditDialog` with the selected ids passed in.

Verify the toolbar is hidden / button disabled when the user lacks edit
permission on the seed.

--------------------------------------------------------------------------
STEP 6 — i18n
Files: apps/dashboard/src/locales/{en,it}.json
--------------------------------------------------------------------------

en:
```json
"bulkEdit": {
  "trigger": "Edit selected",
  "title": "Edit {{count}} entries",
  "pickField": "Choose a field to update",
  "mode": {
    "replace": "Replace",
    "add": "Add",
    "remove": "Remove"
  },
  "confirm": "Update {{count}} entries?",
  "executing": "Updating…",
  "successAll": "{{count}} entries updated",
  "successPartial": "{{updated}} of {{total}} updated. {{failed}} failed.",
  "downloadReport": "Download failure report",
  "tooLarge": "Cannot edit more than {{max}} entries at once"
}
```

it:
```json
"bulkEdit": {
  "trigger": "Modifica selezionati",
  "title": "Modifica {{count}} voci",
  "pickField": "Scegli un campo da aggiornare",
  "mode": {
    "replace": "Sostituisci",
    "add": "Aggiungi",
    "remove": "Rimuovi"
  },
  "confirm": "Aggiornare {{count}} voci?",
  "executing": "Aggiornamento in corso…",
  "successAll": "{{count}} voci aggiornate",
  "successPartial": "{{updated}} di {{total}} aggiornate. {{failed}} fallite.",
  "downloadReport": "Scarica report errori",
  "tooLarge": "Impossibile modificare più di {{max}} voci alla volta"
}
```

==========================================================================
SECTION 4 — TESTS
==========================================================================

### API
- Happy path: 20 ids, one single-value relation field, all updated → returns
  `{ updated: 20, failed: [] }`.
- Partial fail: 5 ids, one referencing a non-existent target → 4 updated,
  1 failed with `relation-target-not-found` problem.
- Multi-relation add mode: preserves existing links, appends new ones,
  positions assigned monotonically after existing max.
- Multi-relation remove mode: removes only the listed ids, leaves others.
- Multi-relation replace mode: drops all existing, sets the new array,
  positions from array order.
- Over-limit request (`MAX_BULK_SIZE + 1` ids) → 400 with `bulk-size-exceeded`.
- Unauthorized request (user without edit permission) → 403.
- Encrypted field in `fields` → 400 with `field-not-bulk-editable`.

### Dashboard
- Toolbar button hidden when user lacks edit permission.
- Dialog field picker excludes hidden/encrypt fields.
- Multi-relation mode selector visible only when branch is multi-relation.
- Partial failure renders the report card; CSV download contains exactly
  the failed ids and reasons.

==========================================================================
SECTION 5 — OUT OF SCOPE
==========================================================================

- Multi-field edits in a single dialog operation (v2).
- Conditional updates ("update only entries where status = draft").
- Undo/redo for bulk operations.
- Background processing for >500 rows. If editorial needs ever push past
  this, the right answer is a queued job, not a synchronous endpoint.

==========================================================================
SECTION 6 — COMPLETION CHECKLIST
==========================================================================

[ ] `ContentRepository.bulkUpdate` interface + D1 implementation.
[ ] `PATCH /content/:slug/bulk` endpoint with full validation and
    per-id atomic semantics.
[ ] Multi-relation modes (`replace`/`add`/`remove`) implemented.
[ ] Single activity-log entry per bulk operation, not per id.
[ ] Frontend toolbar button + Dialog flow.
[ ] Confirmation step shows count and a sample of affected entries.
[ ] Partial-failure report downloadable as CSV.
[ ] Permission gating identical to per-entry PUT.
[ ] Field picker excludes hidden/encrypt branches.
[ ] i18n keys present in both locales.
[ ] All tests pass; no regression on single-entry edit or delete flows.
