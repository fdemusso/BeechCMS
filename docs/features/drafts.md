---
title: Drafts & Versioning Workflow
description: Staged draft lifecycle, schema validation, referential integrity guards, and atomic publishing in BeechCMS.
---

# Drafts & Versioning Workflow

BeechCMS includes a native, edge-optimized **Drafts Engine** that allows content creators to draft, preview, and review changes safely before promoting them to the live public site.

Drafting is enabled per Botanical Seed. When active, edits do not mutate the live database record directly. Instead, pending state is stored in a dedicated staging layer (`content_{slug}_drafts` mirror table) and atomically promoted upon publication.

<p align="center">
  <img src="/images/dual-table-drafts-pipeline.svg" alt="BeechCMS Dual-Table Staging & Drafts Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Key Capabilities

- **Isolated Staging**: Modifying an existing record stores changes as a pending draft in a parallel mirror table. Live readers (via the Public API) continue seeing the published snapshot until explicit publication.
- **Unified Drafts Inbox**: A global view (`/drafts` route in the dashboard and `GET /api/content/drafts`) aggregates all pending work across every draft-enabled Seed.
- **Partial Updates & Lenient Validation**: Drafts allow saving incomplete forms without failing strict `required` constraints, while still validating field types and sanitizing dangerous markup (XSS). Only modified fields (`_touched_fields`) are tracked and applied on publication.
- **Referential Guard**: Attempting to publish a draft that references a deleted record fails atomically with a `422 Unprocessable Entity` (`relation-target-not-found`).
- **Conflict Guard (Optimistic Concurrency)**: A draft that would overwrite a live record changed after the draft was created is refused with a `409 Conflict` (`draft-publish-conflict`) instead of silently winning. See [Publish Conflicts](#publish-conflicts).
- **Audit Trails**: Draft creation, updates, and promotions trigger non-blocking audit events captured by the Activity Logger (`draft saved` and `draft published`).

---

## Enabling Drafts on a Seed

To activate the draft workflow for a Seed, set `allowDrafts: true` in your seed definition:

```typescript
import { defineSeed } from '@beechcms/core'

export const ArticleSeed = defineSeed({
  slug: 'articles',
  label: 'Article',
  labelPlural: 'Articles',
  displayNameAlias: 'title',
  allowDrafts: true, // [!code highlight]
  branches: [
    { alias: 'title', type: 'text', requiredOnCreate: true },
    { alias: 'content', type: 'richtext' },
  ],
})
```

> [!NOTE]
> System columns (`id`, `slug`, `status`, `created_at`, `updated_at`) are generated automatically by the Botanical Engine and must not be defined manually in `branches`.

---

## Dashboard Experience

In the BeechCMS Dashboard:

1. **Pending Draft Indicator**: Published records with pending changes display an amber **Pending draft** badge in data tables and gallery views.
2. **Pending Notice & Draft Mode**:
   - Opening an entry with unpublished changes displays a notification banner (*"This entry has a pending draft"*) with quick actions to **Edit Draft** or **Discard Draft**.
   - While editing a draft, the editor displays an amber banner (*"You are editing a pending draft"*).
3. **Unified Drafts Hub (`/drafts`)**:
   - Lists all pending drafts across all draft-enabled seeds with metadata (Seed type, entry title, last modified timestamp, and last editor).
   - Provides per-row contextual actions to **Edit**, **Publish**, or **Discard** any pending draft directly.
4. **Action Bar**:
   - **Save Draft**: Persists work-in-progress to the staging mirror table without altering public APIs.
   - **Publish Draft**: Atomically commits touched staging fields into the live record, updates status to `published`, and clears the draft staging row.
   - **Discard Draft**: Deletes the staging draft row from the database, reverting the editor to the current live state.

---

## API Endpoints

The draft workflow is mounted at `/api/content`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/content/drafts` | Returns all pending drafts across all draft-enabled Seeds (`DraftSummary[]`). |
| `GET` | `/api/content/:slug/:id/draft` | Retrieves the staging draft for a specific Fruit. |
| `PUT` | `/api/content/:slug/:id/draft` | Creates or updates the staging draft for a specific Fruit. |
| `POST` | `/api/content/:slug/:id/draft/publish` | Promotes the staged draft to live atomically. |
| `DELETE` | `/api/content/:slug/:id/draft` | Discards the staged draft without touching the live record. |

### Listing All Pending Drafts

```bash
curl -X GET https://api.yourdomain.com/api/content/drafts \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Response (`200 OK`):
```json
[
  {
    "id": "art_01HXYZ",
    "seedSlug": "articles",
    "seedLabel": "Articles",
    "title": "Upcoming Release v2.0 (Work in progress)",
    "updatedAt": 1725580800,
    "lastModifiedBy": {
      "name": "Jane Doe",
      "email": "jane@example.com"
    }
  }
]
```

### Saving a Draft

```bash
curl -X PUT https://api.yourdomain.com/api/content/articles/art_01HXYZ/draft \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Upcoming Release v2.0 (Work in progress)",
    "content": { "type": "doc", "content": [] }
  }'
```

Response (`200 OK`):
```json
{
  "success": true
}
```

### Retrieving a Draft

```bash
curl -X GET https://api.yourdomain.com/api/content/articles/art_01HXYZ/draft \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Response (`200 OK`):
```json
{
  "data": {
    "title": "Upcoming Release v2.0 (Work in progress)",
    "content": { "type": "doc", "content": [] }
  }
}
```

### Publishing a Draft

```bash
curl -X POST https://api.yourdomain.com/api/content/articles/art_01HXYZ/draft/publish \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Response (`200 OK`):
```json
{
  "success": true
}
```

If a referenced relation was deleted in the meantime, the API guarantees consistency with RFC 9457 Problem Details:

```json
{
  "type": "https://beechcms.dev/problems/relation-target-not-found",
  "title": "Relation Target Not Found",
  "status": 422,
  "detail": "Field 'author' references 'authors' id='auth_999' which does not exist",
  "instance": "/api/content/articles/art_01HXYZ/draft/publish"
}
```

---

## Publish Conflicts

A draft is a snapshot of intent taken at a point in time. Between the moment it is created and the moment it is published, the live record may be rewritten by someone else — a second editor, an API integration, a bulk update, or an import job. Publishing blindly would overwrite that work with no error and no recovery, because the draft row is deleted in the same operation.

BeechCMS prevents this with **optimistic concurrency control**:

1. When a draft is created, the mirror row records the live record's `updated_at` in the `live_snapshot_at` system column. Subsequent autosaves **never** re-base that value — the snapshot always reflects the version the editor actually started from.
2. On publish, the engine performs an atomic compare-and-set against the live row (`WHERE id = ? AND updated_at = <snapshot>`), evaluated by SQLite itself rather than by application code, so two concurrent publishes cannot both pass the check.
3. If the predicate matches no row, the publish aborts **before** any write of the promotion batch. The live record keeps the other writer's content and the draft survives intact.

```json
{
  "type": "https://beechcms.dev/problems/draft-publish-conflict",
  "title": "Conflict",
  "status": 409,
  "detail": "The live entry was modified after this draft was created. Discard the draft and re-open the entry to start from the current version.",
  "instance": "/api/content/articles/art_01HXYZ/draft/publish"
}
```

The conflict is enforced in the storage layer, so every caller of `publishDraft` inherits it — the REST route, the dashboard, and the queue consumer alike. Resolution is intentionally manual: there is no rebase, no merge, and no automatic retry. The editor discards the stale draft and starts from the current live version.

> [!NOTE]
> **Backward compatible by construction.** `live_snapshot_at` is nullable with no default. A draft created before the column existed carries `NULL`, which disables the predicate and publishes exactly as it did before. Enabling the feature can never block an in-flight draft.

### Schema provisioning

`live_snapshot_at` is a **system column** of `content_{slug}_drafts`, in the same class as `_touched_fields` and `updated_at`. It is emitted exclusively by the Botanical Engine, never by a hand-written migration, and it never appears in an API payload or in generated types.

- Seeds created from now on are **born protected**: `planCreateSeed()` routes through the draft-table generator.
- Draft tables provisioned earlier are repaired through the additive-evolution path (`planExtendSeed`), which emits the `ALTER` only when the table was introspected and lacks the column:

```sql
ALTER TABLE content_articles_drafts ADD COLUMN live_snapshot_at INTEGER;
```

Run `beech schema:apply` (or save the Seed from the dashboard) to apply it to an existing database.

---

## Draft Guard & Sensitive Fields

To ensure security and data consistency:
- **Sensitive Fields Restriction**: Fields governed by `privacy: 'hash'` or `privacy: 'encrypt'` (or non-plain classification policies) cannot be modified via draft staging (`422 content-sensitive-field-edit`). Sensitive fields must be edited directly through authorized, immediate mutations.
- **Seed Guard**: Requests to draft endpoints on a Seed with `allowDrafts: false` (or not set) return `405 Method Not Allowed` with problem type `https://beechcms.dev/problems/draft-not-allowed` (`This content type does not support pending drafts. Set allowDrafts: true on the Seed to enable.`).
- **Parent Entry Guard**: Attempting to draft or publish changes for a record that does not exist in the live table returns `404 Not Found` (`https://beechcms.dev/problems/content-not-found`).
- **Conflict Guard**: Publishing a draft whose live record moved on returns `409 Conflict` (`https://beechcms.dev/problems/draft-publish-conflict`). See [Publish Conflicts](#publish-conflicts).
