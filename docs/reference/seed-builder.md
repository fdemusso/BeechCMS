# Seed Builder & Schema Mutation API

All routes under `/api/seeds` require JWT authentication and user role verification (`requireAdmin`).

These endpoints drive the **Seed Builder UI** in the dashboard and interact with `D1SeedRepository` and `D1SchemaMutator` to execute schema changes.

---

## `GET /api/seeds`

Lists all registered seed records from the database, including runtime and code-defined seeds.

**Request**
```http
GET /api/seeds
Authorization: Bearer eyJ...
```

**Response `200 OK`**
- Headers: `X-Schema-Version: <number>` (current `seed_meta.registry_version` token for OCC)

```json
[
  {
    "slug": "posts",
    "definition": {
      "slug": "posts",
      "label": "Post",
      "labelPlural": "Posts",
      "displayNameAlias": "title",
      "allowDrafts": true,
      "branches": [
        { "id": "br_01", "alias": "title", "label": "Title", "type": "text", "requiredOnCreate": true }
      ]
    },
    "status": "active",
    "source": "runtime",
    "createdAt": 1709670000000,
    "updatedAt": 1709670000000
  }
]
```

---

## `GET /api/seeds/:slug`

Retrieves a single seed definition by its slug.

**Request**
```http
GET /api/seeds/posts
Authorization: Bearer eyJ...
```

**Response `200 OK`**
Returns the `SeedRecord` object (same structure as above). Returns `404 Not Found` if the seed does not exist.

---

## `POST /api/seeds`

Creates a new content type (Seed). This synchronously executes DDL via the Botanical Engine to create the physical `content_{slug}` table, draft mirror table (`content_{slug}_drafts`), FTS5 virtual table, triggers, and relation junction tables, then bumps the multi-isolate registry version token.

**Request**
```http
POST /api/seeds
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "slug": "books",
  "label": "Book",
  "labelPlural": "Books",
  "displayNameAlias": "title",
  "allowDrafts": true,
  "branches": [
    { "alias": "title", "label": "Title", "type": "text", "requiredOnCreate": true },
    { "alias": "author", "label": "Author", "type": "text" }
  ]
}
```

**Response `201 Created`**
```json
{
  "slug": "books"
}
```

---

## `PUT /api/seeds/:slug`

Performs an additive update of an active seed definition. You can add new branches or modify seed metadata (`label`, `allowDrafts`, etc.). This executes additive DDL (`ALTER TABLE ... ADD COLUMN`) for newly added branches and bumps the registry version token.

> **Note:** Destructive field alterations like renaming aliases or changing field types are blocked through `PUT` with HTTP 422 (`alias-rename-not-supported` or `branch-type-change-not-supported`). Omitting existing branches from the payload does not drop the database columns; they are preserved as orphan columns in SQLite. To explicitly drop columns, use `DELETE /api/seeds/:slug/branches/:branchId`.

**Request**
```http
PUT /api/seeds/books
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "label": "Book",
  "labelPlural": "Books",
  "displayNameAlias": "title",
  "allowDrafts": true,
  "branches": [
    { "id": "br_01", "alias": "title", "label": "Title", "type": "text", "requiredOnCreate": true },
    { "id": "br_02", "alias": "author", "label": "Author", "type": "text" },
    { "alias": "isbn", "label": "ISBN", "type": "text" }
  ]
}
```

**Response `200 OK`**
```json
{
  "slug": "books"
}
```

---

## `POST /api/seeds/:slug/branches`

Appends a single new branch to an existing active seed. Automatically allocates a sequential Branch ID (`br_XX`), executes additive DDL (`ADD COLUMN`), and updates the seed definition.

**Request**
```http
POST /api/seeds/books/branches
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "alias": "published_year",
  "label": "Published Year",
  "type": "number",
  "requiredOnCreate": false
}
```

**Response `200 OK`**
```json
{
  "id": "br_03"
}
```

---

## `DELETE /api/seeds/:slug`

Soft-deletes a content type. This flips its database status to `deleted` (hiding it from the dashboard and normal content APIs), but retains its D1 tables and content. Safe and reversible.

**Guards:**
- **Back-reference Check**: Fails with `409 Conflict` (`seed-referenced`) if any other active seed references this content type via a `relation` field.

**Request**
```http
DELETE /api/seeds/books
Authorization: Bearer eyJ...
```

**Response `200 OK`**
```json
{
  "success": true
}
```

---

## `DELETE /api/seeds/:slug/hard`

Hard-deletes a content type. **This is destructive and irreversible.** It drops the main `content_{slug}` table, its mirror draft table, search virtual tables, and related junction tables. It removes the definition row from the `seeds` table, triggers cascade deletion of all R2 media files associated with its fields, and bumps the registry version token.

**Guards:**
1. **Back-reference Check**: Fails with `409 Conflict` (`seed-referenced`) if any other active seed references this content type via a `relation` field.
2. **Typed Confirmation**: Requires a JSON payload matching the target slug to prevent accidental deletion (`{ "confirm": "<slug>" }`).

**Request**
```http
DELETE /api/seeds/books/hard
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "confirm": "books"
}
```

**Response `200 OK`**
```json
{
  "success": true
}
```

---

## `DELETE /api/seeds/:slug/branches/:branchId`

Drops a field (column) from the content type definition and database table. **This is destructive and irreversible.** It runs `ALTER TABLE ... DROP COLUMN` and bumps the version token.

**Request**
```http
DELETE /api/seeds/books/branches/br_03
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "confirm": "books.isbn"
}
```

**Response `200 OK`**
```json
{
  "success": true
}
```

---

## `PATCH /api/seeds/:slug/branches/:branchId/rename`

Renames a field's alias (`ALTER TABLE ... RENAME COLUMN`). Because system internal references use the stable `branch.id`, layout configurations are preserved. This automatically rebuilds FTS5 virtual tables and triggers. The response lists any automations that reference the old alias.

**Request**
```http
PATCH /api/seeds/books/branches/br_02/rename
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "newAlias": "authorName",
  "confirm": "books.author"
}
```

**Response `200 OK`**
```json
{
  "success": true,
  "affectedAutomations": []
}
```

---

## `PATCH /api/seeds/:slug/branches/:branchId/retype`

Changes the data type of a field using column-level in-place migration with temporary columns and SQLite `CAST` expressions (`ADD COLUMN __retype_*` -> `UPDATE ... CAST` -> `DROP COLUMN` -> `RENAME COLUMN`). Retyping to or from `repeater` is prohibited and returns `422 Unprocessable Entity` (`retype-not-supported`).

**Request**
```http
PATCH /api/seeds/books/branches/br_price/retype
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "newType": "number",
  "confirm": "books.price"
}
```

**Response `200 OK`**
```json
{
  "success": true
}
```

---

## `POST /api/seeds/:slug/fts/rebuild`

Recreates the virtual full-text search virtual tables and triggers for a seed, and backfills the index from live `content_{slug}` data.

**Request**
```http
POST /api/seeds/books/fts/rebuild
Authorization: Bearer eyJ...
```

**Response `200 OK`**
```json
{
  "success": true
}
```

---

## `GET /api/seeds/:slug/orphans`

Scans the D1 database schema and returns a list of database columns present in `content_{slug}` that are absent from the seed definition.

**Request**
```http
GET /api/seeds/books/orphans
Authorization: Bearer eyJ...
```

**Response `200 OK`**
```json
{
  "orphans": ["old_isbn_field", "deprecated_field"]
}
```

---

## `POST /api/seeds/:slug/mcp-plan`

Computes a dry-run migration plan for AI agents (or programmatic tools) without executing any mutations. Inspects physical SQLite table columns (`PRAGMA table_info`), validates candidate relations against the full active seed registry, classifies migration safety, and produces exact DDL statements.

**Request**
```http
POST /api/seeds/books/mcp-plan
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "candidate": {
    "slug": "books",
    "label": "Book",
    "labelPlural": "Books",
    "displayNameAlias": "title",
    "allowDrafts": true,
    "branches": [
      { "id": "br_01", "alias": "title", "label": "Title", "type": "text", "requiredOnCreate": true },
      { "alias": "pages", "label": "Pages", "type": "number" }
    ]
  }
}
```

**Response `200 OK`**
```json
{
  "slug": "books",
  "classification": "additive",
  "requiresConfirmation": false,
  "applicable": true,
  "blockedReasons": [],
  "statements": [
    "ALTER TABLE content_books ADD COLUMN pages REAL;"
  ],
  "ftsRebuildNeeded": false,
  "expectedVersion": 4,
  "issues": []
}
```

- `classification`: `'create'` (table does not exist), `'additive'` (safe additions only), or `'destructive'` (dropped branch, alias rename, type change).
- `expectedVersion`: The current `seed_meta.registry_version` value that must be echoed back to `mcp-apply`.

---

## `POST /api/seeds/:slug/mcp-apply`

Executes an atomic, OCC-guarded, additive-only migration. Guarantees that additive DDL, the definition upsert in the `seeds` table, and the `registry_version` bump succeed as **one transactional batch** (`db.batch()`).

If a concurrent edit has incremented `registry_version` since `mcp-plan` was executed, the batch is rolled back and returns `409 Conflict`. Destructive changes are rejected with `422 Unprocessable Entity`.

**Request**
```http
POST /api/seeds/books/mcp-apply
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "candidate": {
    "slug": "books",
    "label": "Book",
    "labelPlural": "Books",
    "displayNameAlias": "title",
    "allowDrafts": true,
    "branches": [
      { "id": "br_01", "alias": "title", "label": "Title", "type": "text", "requiredOnCreate": true },
      { "alias": "pages", "label": "Pages", "type": "number" }
    ]
  },
  "expectedVersion": 4,
  "planId": "optional-uuid"
}
```

**Response `200 OK`**
```json
{
  "slug": "books",
  "newVersion": 5,
  "ftsRebuilt": false
}
```

**Error Responses**
- `400 Bad Request`: Invalid slug or non-integer `expectedVersion`.
- `409 Conflict` (`conflict`): Schema drift detected (`expectedVersion` ≠ live version). Nothing was written.
- `422 Unprocessable Entity` (`destructive-change-not-supported`): Blocked destructive intent (points to dedicated endpoints).
- `422 Unprocessable Entity` (`validation-failed`): Core schema validation errors.

> [!TIP]
> For higher-level usage via IDE agents over Stdio JSON-RPC, see the dedicated [MCP Server (@beechcms/mcp) Reference](/reference/mcp-server).

