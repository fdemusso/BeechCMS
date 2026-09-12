# Public API

The Public API (`/api/v1/public/`) is an edge-native, hardened endpoint designed for external consumers — headless frontends, mobile apps, static site generators, and public form submissions. All error responses conform to **RFC 9457 Problem Details** (`Content-Type: application/problem+json`).

---

## Permission Model

Access is controlled across three distinct layers:

### Level 1 — Seed Capability Flags
Defined in each Seed blueprint schema:
```typescript
interface Seed {
  allowPublicRead?: boolean;   // Enables GET /api/v1/public/:seed
  allowPublicPost?: boolean;   // Enables POST /api/v1/public/:seed/add
  allowPublicEdit?: boolean;   // Enables PUT & PATCH /api/v1/public/:seed/edit/:id
}
```
If a capability flag is `false` or absent, the endpoint fails closed and returns `403 Forbidden` (`operation-not-allowed`) regardless of credentials.

### Level 2 — API Key Split & Zero-Secret Mode
1. **Authenticated Requests (`X-API-Key` header):**
   - `PUBLIC_READ_API_KEY`: Grants read access to `GET /api/v1/public/*`.
   - `PUBLIC_WRITE_API_KEY`: Grants write access to `POST` and `PUT/PATCH /api/v1/public/*`.
2. **Zero-Secret Public Form Mode:**
   - Public frontends can create entries via `POST /api/v1/public/:seed/add` without exposing any secret API key by utilizing the built-in **Time-Trap token** anti-bot mechanism (`_timeTrapToken`) and hidden honeypot fields.
   - Seed schema discovery (`GET /api/v1/public/:seed/schema`) is zero-secret and requires no API key.

### Level 3 — Published-Only Filter
By default, all public read queries automatically filter by `AND status = 'published'` (`PUBLIC_PUBLISHED_ONLY !== 'false'`). Content in `draft` or `review` status is invisible to external consumers. To expose drafts publicly, explicitly set `PUBLIC_PUBLISHED_ONLY=false`.

---

## Rate Limiting

The Public API uses Cloudflare's native Rate Limiting API (with an in-engine Token Bucket fallback):

```jsonc
// wrangler.jsonc
{
  "ratelimits": [
    { "name": "PUBLIC_READ_RATE_LIMITER",  "namespace_id": "1003", "simple": { "limit": 120, "period": 60 } },
    { "name": "PUBLIC_WRITE_RATE_LIMITER", "namespace_id": "1004", "simple": { "limit": 20,  "period": 60 } }
  ]
}
```

The rate limit key is `<client_ip>:<seed>:<publicApiRead|publicApiWrite>`. On limit breach, the endpoint returns:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/problem+json

{
  "type": "https://beechcms.dev/problems/rate-limit-exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "Too many requests",
  "instance": "/api/v1/public/articoli"
}
```

---

## Seed Schema — `GET /api/v1/public/:seed/schema`

Returns the public schema for a single seed. Useful for frontend dynamic form generation and client-side validation. **Zero-secret: no API key required.**

> **Privacy Filtering:** Branches with `policies.public: false`, `internal`, or `restricted` classifications are automatically stripped from the schema.

**Request**

```http
GET /api/v1/public/posts/schema
```

**Response `200 OK`**

```json
{
  "slug": "posts",
  "label": "Post",
  "labelPlural": "Posts",
  "allowPublicRead": true,
  "allowPublicPost": true,
  "allowPublicEdit": false,
  "branches": [
    {
      "alias": "title",
      "type": "text",
      "label": "Title",
      "requiredOnCreate": true,
      "policies": { "public": true, "visibility": "full" }
    },
    {
      "alias": "body",
      "type": "richtext",
      "label": "Body",
      "requiredOnCreate": false,
      "policies": { "public": true, "visibility": "full" }
    }
  ]
}
```

---

## Read — `GET /api/v1/public/:seed`

Reads entries for a seed. Requires `allowPublicRead: true` and `PUBLIC_READ_API_KEY`.

**Query parameters:**

| Parameter | Description |
|---|---|
| `id` | Fetch a single entry by UUID |
| `slug` | Fetch a single entry by its unique slug |
| `page` / `limit` | Pagination (limit clamped to max 100) |
| `all=true` | Returns up to 100 entries ignoring pagination |
| `latest=N` | Returns the N most recent entries (clamped 1–100, default 10) |
| `search` | Full-text search across content fields and slug |
| `orderBy` / `orderDir` | Sorting by field alias or system timestamp (`asc` \| `desc`) |
| `filter` | JSON-encoded filter object (see below) |
| `fields` | Comma-separated list of aliases to project |
| `include` | Comma-separated relation aliases to expand at depth 1 (max 3 includes) |

**Filter syntax:**

```json
{
  "logic": "AND",
  "where": [
    { "field": "status",     "op": "eq",          "value": "published" },
    { "field": "budget",     "op": "gte",         "value": 1000 },
    { "field": "tags",       "op": "has_any_tag", "value": ["design", "dev"] }
  ]
}
```

**Supported filter operators (snake_case required):**
`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty`, `in`, `not_in`, `has_tag`, `has_any_tag`, `has_all_tags`.

**Single entry request:**

```http
GET /api/v1/public/articoli?slug=my-article
X-API-Key: dev-public-read-key-changeme
```

**Response `200 OK` (single entry):**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "my-article",
    "status": "published",
    "created_at": 1713600000,
    "updated_at": 1713600000,
    "title": "My Article",
    "body": { "schemaVersion": 1, "doc": { "type": "doc", "content": [] } },
    "cover_image": "https://api.beech.local/api/media/1713600000-cover.jpg"
  },
  "meta": { "seed": "articoli" }
}
```

> **Note:** The response is **flat** — content fields are projected at the root of `data` alongside system properties (`id`, `slug`, `status`).

**List request:**

```http
GET /api/v1/public/articoli?page=1&limit=10&orderBy=created_at&orderDir=desc
X-API-Key: dev-public-read-key-changeme
```

**Response `200 OK` (list):**

```json
{
  "data": [
    { "id": "...", "slug": "...", "status": "published", "title": "..." }
  ],
  "meta": {
    "total": 24,
    "page": 1,
    "limit": 10,
    "returned": 10,
    "seed": "articoli"
  }
}
```

---

## Relation Expansion — `?include=`

The `include` query parameter enables server-side resolution and expansion of related entries in a single request. Expanded targets are returned under the `_includes` object on each entry.

**Request with relation expansion:**

```http
GET /api/v1/public/posts?slug=my-first-post&include=category_id,related_posts
X-API-Key: dev-public-read-key-changeme
```

**Response `200 OK` with `_includes`:**

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "my-first-post",
    "status": "published",
    "title": "My First Post",
    "category_id": "8a01f92e-3367-42f2-8ce1-b9242a7fa5bc",
    "related_posts": ["661e8400-e29b-41d4-a716-446655440111"],
    "_includes": {
      "category_id": {
        "id": "8a01f92e-3367-42f2-8ce1-b9242a7fa5bc",
        "slug": "technology",
        "name": "Technology",
        "status": "published"
      },
      "related_posts": [
        {
          "id": "661e8400-e29b-41d4-a716-446655440111",
          "slug": "second-post",
          "title": "Second Post",
          "status": "published"
        }
      ]
    }
  },
  "meta": { "seed": "posts" }
}
```

### Operational Limits & Invariants
- **Depth 1 Only**: Nested dot paths (e.g., `include=category_id.author`) are rejected with `400 Bad Request` (`invalid-include`).
- **Maximum 3 Includes**: A single request may request at most 3 distinct include branches. Requests with >3 branches return `400 Bad Request`.
- **Target ID Clamping**: Sub-queries for included entries are bounded at a maximum of 200 target IDs per branch.
- **Access Policies**: A relation branch is expandable only if its resolved policy allows public read (`resolvePolicies(branch).public`) and the target seed specifies `allowPublicRead: true`.
- **Projection Independence**: Relation expansion works seamlessly with `?fields=`. Even if the foreign key alias is omitted from `?fields=`, `_includes` is still populated.

---

## Relation Subquery Filters

A relation subquery filters the collection by a condition evaluated against the **target** of a relation branch, instead of against the parent entry itself. It is a nested object in the `value` position of an existing `in` condition inside the `filter` query parameter — no new query parameter is introduced.

**Request — posts in the category named "Tech":**

```http
GET /api/v1/public/posts?filter={"logic":"AND","where":[
  {"field":"category_id","op":"in","value":{"logic":"AND","where":[{"field":"name","op":"eq","value":"Tech"}]}}
]}
X-API-Key: dev-public-read-key-changeme
```

The nested value is `{ where: [...], logic?: 'AND' | 'OR' }`; `where` entries share the ordinary `{field, op, value}` shape and are validated **against the target seed**, through the same public + filterable policy gate as a top-level filter. An `in` condition on a relation alias whose value is a **plain array of ids** (rather than a subquery object) stays legal and is routed through the same resolver — this also fixes a multi-relation `in` filter that answered `500` before this endpoint existed.

### Operational Limits & Invariants
- **Relation Reachability**: `field` must be a publicly reachable relation branch of the queried seed — the same five checks `?include=` enforces. Both single and multi relations are accepted.
- **Operator**: `op` must be `in`. Any other operator paired with an object value returns `400` (`invalid-subquery`).
- **Depth 1 Only**: A nested condition whose own `value` is an object (a subquery inside a subquery) returns `400`.
- **Request Bound**: At most **2** relation subqueries per request; each inner `where` carries at most **5** conditions.
- **Published Only**: The inner query resolves against published entries only, matching `?include=`.
- **Refused, Not Truncated**: A resolved target-id set larger than **200**, or a resolved parent-id set larger than **500** (multi-relation fan-out), is refused with `400` — never silently truncated, since truncation would silently drop matching parent rows.
- **Composability**: A subquery filter composes with `?include=` in the same request; the filtered set is resolved first, then relations are expanded on the surviving entries.

### Error Responses
- `400 invalid-subquery`: the relation is not publicly reachable, the operator/shape is wrong, or a resolved id set exceeds its cap.
- `400 invalid-filter`: an inner `where` condition names a field on the target seed that is not public or not filterable — the same contract an ordinary top-level filter enforces.

---

## Schema Revision Header — `X-Schema-Revision`

All responses emitted across the Public API surface (`/api/v1/public/*`) carry the `X-Schema-Revision` response header:

```http
X-Schema-Revision: v1:a1b2c3d4e5f60718293a4b5c6d7e8f90
```

- **Format**: `v<version>:<32_hex_sha256>`.
- **Ubiquity**: Injected early by `schemaRevisionMiddleware` on all status codes (`200`, `201`, `400`, `401`, `404`, `429`).
- **Cache Memoization**: Computed once from `computeSchemaFingerprint` and cached per isolate via a `WeakMap` on the `SeedRegistry` instance.
- **Drift Detection**: Used by the Fluent Client Query Builder to verify contract alignment and detect schema updates without out-of-band polling.

## Anti-Bot Helper — `GET /api/v1/public/timetrap/token`

Generates an encrypted, single-use Time-Trap token for zero-secret form submissions.

**Response `200 OK`**

```json
{
  "token": "ey...",
  "minDeltaSeconds": 1.5
}
```

---

## Create — `POST /api/v1/public/:seed/add`

Creates an entry via the Public API. Requires `allowPublicPost: true`.

**Authentication Modes:**
1. **Authenticated Mode:** Send `X-API-Key: <PUBLIC_WRITE_API_KEY>`.
2. **Zero-Secret Form Mode:** Include `_timeTrapToken` in the payload (or `x-time-trap` header) and ensure the anti-bot honeypot fields (`fax_number`, `website_url`, `middle_name`, `secondary_phone`, `_gotcha`, `honeypot`) remain empty.

**Request**

```http
POST /api/v1/public/articoli/add
X-API-Key: dev-public-write-key-changeme
Content-Type: application/json
Idempotency-Key: my-client-request-id-001

{
  "status": "published",
  "slug": "my-article",
  "data": {
    "title": "My Article",
    "body": "Content here"
  }
}
```

**Response `201 Created`**

```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "my-article",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "my-article",
    "status": "published",
    "title": "My Article",
    "body": "Content here"
  },
  "meta": {
    "seed": "articoli"
  }
}
```

**Idempotency guarantees:**
- **Same key, same payload:** Replays cached `201 Created` response.
- **Same key, different payload:** Fails with `409 Conflict` (`idempotency-key-conflict`).
- **TTL:** Defaults to 24 hours (`PUBLIC_IDEMPOTENCY_TTL_SECONDS`).

---

## Update — `PUT` & `PATCH /api/v1/public/:seed/edit/:id`

Partially updates an existing entry. Requires `allowPublicEdit: true` and `PUBLIC_WRITE_API_KEY`.

**Merge semantics:**
- Fields present in `data` overwrite existing values.
- Omitted fields retain current values.
- Fields explicitly sent as `null` are cleared in SQLite.

**Request**

```http
PUT /api/v1/public/articoli/edit/550e8400-e29b-41d4-a716-446655440000
X-API-Key: dev-public-write-key-changeme
Content-Type: application/json

{
  "status": "published",
  "data": {
    "title": "Updated Title",
    "body": null
  }
}
```

**Response `200 OK`**

```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "my-article",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "my-article",
    "status": "published",
    "title": "Updated Title",
    "body": null
  },
  "meta": {
    "seed": "articoli"
  }
}
```
