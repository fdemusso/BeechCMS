# Internal Content API

All routes require `Authorization: Bearer <access_token>`.

The content engine uses the Botanical Engine to generate optimized SQL queries against relational tables (`content_{slug}`). Consumers interact using **field aliases** defined in the Seed.

---

## List Entries — `GET /api/content/:seed`

Returns a paginated list of entries for a given content type.

**Request**

```http
GET /api/content/progetti?page=1&limit=20&sortBy=created_at&sortDir=desc
Authorization: Bearer eyJ...
```

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `25` | Items per page (clamped 1–100) |
| `sortBy` | `string` | `created_at` | Field alias or system column (`created_at`, `updated_at`, `slug`) |
| `sortDir` | `asc \| desc` | `asc` | Sort direction |
| `search` | `string` | — | Full-text search across content fields and slug |
| `filters` | `string` | — | Serialized JSON string of `QueryFilterGroup[]` |

**Response `200 OK` (with query parameters):**

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "hello-world",
      "status": "published",
      "created_at": 1713600000,
      "updated_at": 1713600000,
      "has_pending_draft": false,
      "title": "Hello World",
      "budget": 5000,
      "published_at": "2024-04-20"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "relations": {}
}
```

> **Note:** Calling `GET /api/content/:seed` without query parameters returns the items array directly (`[...]`). Each item includes a `has_pending_draft` boolean indicating whether a draft exists in `content_{slug}_drafts`.

> [!NOTE]
> On a Seed with `softDelete: true`, trashed entries are excluded from this listing. Retrieve them from [`GET /api/content/:seed/trash`](#list-trash).

---

## Create Entry — `POST /api/content/:seed`

Creates a new content entry. Content fields must be sent flat at the root of the JSON body (not nested under a `data` object).

**Request**

```http
POST /api/content/progetti
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "status": "draft",
  "slug": "my-project",
  "title": "My Project",
  "budget": 15000,
  "cover_image": "https://cdn.example.com/img.jpg"
}
```

**Rules:**
- `status` must be `draft | review | published`.
- `slug` is optional; auto-generated from `displayNameAlias`, `title`, `name`, or a random UUID if absent.
- Keys must match valid aliases defined in the Seed; unknown aliases return `400 Bad Request`.
- Required fields (`required_on_create`) must be provided and non-empty.

**Response `201 Created`**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Error responses:**

| Status | Condition |
|---|---|
| `400` | Unknown alias, field type mismatch, missing required field, or malformed JSON |
| `409` | Slug already exists for this content type (`content-slug-conflict`) |
| `422` | Dangerous markup detected in a text or richtext field (`content-dangerous-content`) |

---

## Update Entry — `PUT /api/content/:seed/:id`

Partially updates an existing entry. Only fields present in the payload are updated; omitted fields retain their stored values. Fields sent as `null` are cleared in SQLite. Content fields must be sent flat at the root of the JSON body.

**Request**

```http
PUT /api/content/progetti/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "status": "published",
  "title": "Updated Title",
  "budget": null
}
```

**Response `200 OK`**

```json
{
  "success": true
}
```

---

## Delete Entry — `DELETE /api/content/:seed/:id`

Deletes a content entry. The semantics depend on the Seed's `softDelete` flag:

| Seed | Behaviour |
|---|---|
| `softDelete: true` | **Reversible.** Stamps `deleted_at` and moves the entry to the [Trash](#trash-soft-delete-purge). Junction rows, pending drafts, and R2 media are left untouched so the entry stays restorable whole. |
| `softDelete` absent or `false` | **Irreversible.** Drops the row, cascades junction and draft rows, cleans up R2 media, and appends an event to the deletion ledger. |

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `purge` | `"true"` | — | Forces the irreversible path even on a soft-delete Seed. Use it to erase a trashed entry, or to skip the Trash entirely. |

**Cascade behaviour (irreversible path only):** the API extracts media keys from `file`, `json`, and `repeater` branch values of the deleted entry and issues deletion commands against Cloudflare R2 (`bucket.delete(key)`). If R2 deletion fails, the content row remains deleted (best-effort media cleanup). Images embedded in `<img src="...">` inside `richtext` fields are not parsed during cascade deletion. A **soft** delete never touches the bucket.

Both paths run the `beforeDelete` / `afterDelete` lifecycle hooks.

**Request**

```http
DELETE /api/content/progetti/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "success": true,
  "softDeleted": true
}
```

`softDeleted: false` means the entry was erased irreversibly: R2 media were wiped and the erasure was recorded in the ledger.

---

## Trash, Soft Delete & Purge {#trash-and-purge}

Available on Seeds declaring `softDelete: true`. Conceptual overview, DDL details, and the deletion-ledger design: [Trash, Soft Delete & GDPR Purge](/features/trash).

**Seed guard:** every route in this section returns `409 Conflict` with `type: content-soft-delete-disabled` when the Seed does not declare `softDelete: true`, and `404` (`content-seed-not-found`) when the Seed slug is unknown.

**Visibility:** trashed entries are excluded from every other read — the list endpoint, single reads, the Public API, relation expansion, and relation subqueries — by a predicate compiled at the engine's single SQL chokepoint. Only the route below returns them.

---

### List Trash — `GET /api/content/:seed/trash` {#list-trash}

Returns trashed entries, newest deletion first (`ORDER BY deleted_at DESC`).

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `page` | `number` | `1` | Page number |
| `limit` | `number` | `25` | Items per page (clamped to a maximum of 100) |

Sorting, search, and filtering are deliberately not supported on this route.

**Request**

```http
GET /api/content/orders/trash?page=1&limit=25
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "ord-2026-0042",
      "status": "published",
      "created_at": 1713600000,
      "updated_at": 1713600000,
      "deleted_at": 1713686400,
      "data": {
        "reference": "ORD-2026-0042",
        "total": 1250
      }
    }
  ],
  "total": 3,
  "page": 1,
  "limit": 25
}
```

Items use the same envelope as `GET /api/content/:seed` — system columns at the top level plus a `data` object — and run through the same field-visibility policies, so a branch with `policies.visibility: 'masked' | 'hidden'` stays masked here exactly as it is on the main list. `has_pending_draft` is not computed: a trashed entry is not editable.

`deleted_at` is present **only** on rows read through the Trash. A live row never carries the key, so every active payload — Public API and client SDK included — is unchanged.

**Permission:** `content:read` on the Seed scope.

---

### Restore Entry — `POST /api/content/:seed/:id/restore`

Clears `deleted_at` and returns the entry to the active list.

**Request**

```http
POST /api/content/orders/550e8400-e29b-41d4-a716-446655440000/restore
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "success": true,
  "slug": "ord-2026-0042"
}
```

> [!IMPORTANT]
> **The returned `slug` may differ from the original.** On a soft-delete table, trashing an entry frees its slug for reuse. If a live entry claimed it in the meantime, the restore does not fail with a conflict — it renames the restored entry to `{original-slug}-restored-{first 8 chars of the id}` and returns the slug it actually ended up with. The suffix is derived from the entry id, not a timestamp, so a retried restore is idempotent. Always read `slug` from the response rather than assuming the original.

Restore does **not** run the delete lifecycle hooks; it is not a deletion. It logs a content-update activity event and dispatches the `update` automation event.

**Error responses:**

| Status | `type` | Cause |
|---|---|---|
| `400` | `content-invalid-slug-or-id` | Missing seed slug or entry id |
| `404` | `content-seed-not-found` | Seed slug not found |
| `404` | `content-not-found` | No **trashed** entry with that id |
| `409` | `content-soft-delete-disabled` | Seed does not declare `softDelete: true` |

**Permission:** `content:update` on the Seed scope.

---

### Bulk Restore — `POST /api/content/:seed/trash/bulk-restore`

Restores up to 500 trashed entries. Each id reports its own outcome; one failure never aborts the batch, and hooks run per entry.

**Request**

```http
POST /api/content/orders/trash/bulk-restore
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "ids": ["550e8400-e29b-41d4-a716-446655440000", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"]
}
```

**Response `200 OK`**

```json
{
  "succeeded": ["550e8400-e29b-41d4-a716-446655440000"],
  "failed": [
    {
      "id": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "problem": {
        "status": 404,
        "type": "content-not-found",
        "detail": "not-found"
      }
    }
  ]
}
```

A partial failure still returns `200 OK` — inspect `failed`.

**Error responses:**

| Status | `type` | Cause |
|---|---|---|
| `400` | `content-invalid-json` | Request body is not valid JSON |
| `400` | `bulk-invalid-ids` | `ids` is not a non-empty array of strings |
| `400` | `bulk-size-exceeded` | More than 500 ids |
| `409` | `content-soft-delete-disabled` | Seed does not declare `softDelete: true` |

**Permission:** `content:update` on the Seed scope.

---

### Bulk Purge — `POST /api/content/:seed/trash/bulk-purge`

Irreversibly erases up to 500 entries: rows, cascaded junction and draft rows, attached R2 media, and one ledger event per entry. Same request and response shape as bulk restore (failure `type` is `bulk-purge-error` for non-`404` failures).

**Request**

```http
POST /api/content/orders/trash/bulk-purge
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "ids": ["550e8400-e29b-41d4-a716-446655440000"]
}
```

**Response `200 OK`**

```json
{
  "succeeded": ["550e8400-e29b-41d4-a716-446655440000"],
  "failed": []
}
```

R2 media for every successfully purged entry are deleted best-effort after the batch commits.

**Permission:** `content:delete` on the Seed scope.

---

### Reconcile Purges — `POST /api/content/:seed/trash/reconcile`

Operator/compliance route. Pages through the R2 deletion ledger for this Seed and re-erases any entry that is still present in D1 — the case after a database restore resurrected data that a user had already had erased. The external log is the sole source of truth; reconciliation never runs in the other direction. An entry already absent is skipped silently.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `limit` | `number` | `100` | Ledger events to scan (clamped to a maximum of 500) |
| `cursor` | `string` | — | Opaque cursor from the previous response's `nextCursor` |

**Request**

```http
POST /api/content/orders/trash/reconcile?limit=100
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "scanned": 100,
  "repurged": ["550e8400-e29b-41d4-a716-446655440000"],
  "nextCursor": "eyJjdXJzb3IiOiIuLi4ifQ"
}
```

`nextCursor` is absent on the last page. The route has no dashboard UI by design.

**Permission:** `content:delete` on the Seed scope.

---

## Rotate Hashed Field — `POST /api/content/:seed/:id/rotate-field`

Updates the value of a field marked with `privacy: 'hash'`. The caller must supply the current plaintext value for verification. The API computes its SHA-256 digest, matches it against the stored value, and writes the SHA-256 digest of the new value.

**Request**

```http
POST /api/content/memberships/550e8400-e29b-41d4-a716-446655440000/rotate-field
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "fieldAlias": "password",
  "currentValue": "old-plaintext-secret",
  "nextValue": "new-plaintext-secret"
}
```

| Field | Type | Description |
|---|---|---|
| `fieldAlias` | `string` | Alias of the branch to rotate (must have `privacy: 'hash'`) |
| `currentValue` | `string` | Current plaintext value |
| `nextValue` | `string` | New plaintext value |

**Response `200 OK`**

```json
{
  "success": true
}
```

**Error responses:**

| Status | `type` | Cause |
|---|---|---|
| `400` | `rotate-field-invalid-body` | Missing or empty `fieldAlias`, `currentValue`, or `nextValue` |
| `400` | `rotate-field-unknown-field` | `fieldAlias` does not exist in the seed |
| `400` | `rotate-field-invalid-next` | `nextValue` fails type validation |
| `401` | — | Missing or invalid JWT |
| `403` | `rotate-field-current-mismatch` | `currentValue` digest does not match stored hash |
| `404` | `content-seed-not-found` | Seed slug not found |
| `404` | `content-not-found` | Entry ID not found |
| `422` | `rotate-field-not-hashable` | Field is not configured with `privacy: 'hash'` |
| `422` | `rotate-field-not-set` | Field has no stored value |

---

## Pending Drafts

Pending drafts allow content editors to stage revisions on published entries without publishing them immediately. Draft revisions are persisted in the mirror table `content_{slug}_drafts`.

**Prerequisite:** The Seed must have `allowDrafts: true`. If `false` or absent, all draft endpoints return `405 Method Not Allowed` (`draft-not-allowed`).

---

### `GET /api/content/drafts`

Returns an aggregated list of all pending drafts across all draft-enabled seeds.

**Request**

```http
GET /api/content/drafts
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "drafts": [
    {
      "seedSlug": "articoli",
      "entryId": "550e8400-e29b-41d4-a716-446655440000",
      "updatedAt": 1713605000
    }
  ]
}
```

---

### `PUT /api/content/:seed/:id/draft`

Creates or updates a pending draft in `content_{slug}_drafts`. Accepts flat alias-keyed field values.

**Request**

```http
PUT /api/content/articoli/550e8400-e29b-41d4-a716-446655440000/draft
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "title": "Titolo aggiornato in bozza",
  "body": { "schemaVersion": 1, "doc": { "type": "doc", "content": [] } }
}
```

**Response `200 OK`**

```json
{
  "success": true
}
```

**Error responses:**

| Status | `type` | Cause |
|---|---|---|
| `400` | `content-invalid-json` | Request body is not valid JSON |
| `400` | `content-validation-failed` | Field validation failed |
| `404` | `content-not-found` | Entry ID not found |
| `405` | `draft-not-allowed` | Seed does not have `allowDrafts: true` |
| `422` | `content-sensitive-field-edit` | Attempted to modify field with `privacy !== 'plain'` |
| `422` | `content-dangerous-content` | Dangerous markup in richtext field |

---

### `GET /api/content/:seed/:id/draft`

Fetches the pending draft row for an entry.

**Request**

```http
GET /api/content/articoli/550e8400-e29b-41d4-a716-446655440000/draft
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "data": {
    "title": "Titolo aggiornato in bozza",
    "body": { "schemaVersion": 1, "doc": { "type": "doc", "content": [] } }
  }
}
```

---

### `POST /api/content/:seed/:id/draft/publish`

Promotes the pending draft to live published content in an atomic Cloudflare D1 batch (`database.batch`), synchronizing relation tables and deleting the draft row.

**Request**

```http
POST /api/content/articoli/550e8400-e29b-41d4-a716-446655440000/draft/publish
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "success": true
}
```

**Error responses:**

| Status | `type` | Cause |
|---|---|---|
| `404` | `content-not-found` | Entry ID not found |
| `404` | `draft-not-found` | No pending draft found for this entry |
| `405` | `draft-not-allowed` | Seed does not have `allowDrafts: true` |
| `422` | `relation-target-not-found` | A target record referenced in a draft relation was deleted |

---

### `DELETE /api/content/:seed/:id/draft`

Discards the pending draft by deleting the mirror row in `content_{slug}_drafts`. The live published entry is untouched.

**Request**

```http
DELETE /api/content/articoli/550e8400-e29b-41d4-a716-446655440000/draft
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "success": true
}
```
