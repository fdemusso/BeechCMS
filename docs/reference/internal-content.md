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

Deletes a content entry and triggers cascade cleanup of associated R2 media files.

**Cascade behaviour:** Upon database deletion, the API extracts media keys from `file`, `json`, and `repeater` branch values of the deleted entry and issues deletion commands against Cloudflare R2 (`bucket.delete(key)`). If R2 deletion fails, the content row remains deleted (best-effort media cleanup). Images embedded in `<img src="...">` inside `richtext` fields are not parsed during cascade deletion.

**Request**

```http
DELETE /api/content/progetti/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJ...
```

**Response `200 OK`**

```json
{
  "success": true
}
```

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
