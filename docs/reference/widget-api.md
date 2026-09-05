# Widget API

## Overview

The Widget API exposes six read-only endpoints at `/api/widget/<action>/:seed` designed exclusively for the dashboard's widget layer and data visualization components. All endpoints are JWT-protected (same `Authorization: Bearer <token>` flow as the Internal Content API).

Incoming `column` aliases are strictly validated against registered seed branches and system columns (`id`, `slug`, `status`, `created_at`, `updated_at`), then composed directly into prepared SQL queries against the relational `content_{slug}` table. Any unknown or unsanitized column reference is rejected with HTTP 400.

**Base path:** `/api/widget`  
**Auth:** `Authorization: Bearer <access_token>` (15-min JWT, same as Internal Content API)  
**Source file:** `apps/api/src/features/widget/widget.ts`  
**Repository:** `apps/api/src/shared/db/repositories/d1-widget.repository.ts`

---

## `AggregateFormula` Type

All endpoints that accept a `formula` query parameter expect a JSON-encoded object matching this discriminated union:

```typescript
type AggregateFormula =
  | { op: 'count' }                                                            // COUNT(*)
  | { op: 'sum';          column: string }                                     // SUM(CAST(column AS REAL))
  | { op: 'avg';          column: string }                                     // AVG(CAST(column AS REAL))
  | { op: 'min';          column: string }                                     // MIN(CAST(column AS REAL))
  | { op: 'max';          column: string }                                     // MAX(CAST(column AS REAL))
  | { op: 'countWhere';   column: string; value: unknown }                    // COUNT(CASE WHEN column = ? THEN 1 END)
  | { op: 'percentageOf'; numeratorColumn: string; denominatorColumn: string } // SUM(num)/SUM(den)*100 (safe division)
```

`column` values are **API aliases** (e.g. `"price"`, `"created_at"`), not internal IDs. System columns (`id`, `slug`, `status`, `created_at`, `updated_at`) pass validation without requiring branch definitions.

---

## `TimeWindow` and Date Range

Endpoints supporting time filtering accept either a predefined `window` enum or explicit timestamp bounds (`from` and `to`):

```typescript
type TimeWindow = 'week' | 'month' | 'year' | 'all'
```

| Value | SQL Filter Applied | Description |
|---|---|---|
| `week` | `created_at > unixepoch('now', '-7 days')` | Past 7 days |
| `month` | `created_at > unixepoch('now', '-1 month')` | Past calendar month |
| `year` | `created_at > unixepoch('now', '-1 year')` | Past calendar year |
| `all` | `1=1` | Full table scan (no time constraint) |

### Custom Date Range (`from` / `to`)
When `from` and `to` query parameters (unix epoch timestamps in seconds, `from <= to`) are provided, they take precedence over `window` and apply:
```sql
created_at BETWEEN ? AND ?
```
When `from` and `to` are active on `/api/widget/aggregate/:seed`, the response `window` property contains `{ from: number, to: number }`.

---

## Aggregate — `GET /api/widget/aggregate/:seed`

Evaluates a single aggregate formula against all entries of a seed within a time window or date range.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `formula` | JSON string | Yes | — | JSON-encoded `AggregateFormula` |
| `window` | `TimeWindow` | No | `'all'` | Predefined time window |
| `from` | integer | No | — | Start timestamp in epoch seconds |
| `to` | integer | No | — | End timestamp in epoch seconds |

**Response `200`:**

```json
{ "value": 142, "window": "month" }
```

**Errors:**
- `400 Bad Request`: `Missing formula parameter`, `Invalid formula JSON`, `Invalid formula structure`, or `Invalid column reference`.
- `404 Not Found`: Seed slug not found in registry.
All errors return RFC 7807/9457 Problem Details (`{ type: 'about:blank', title, status, detail }`).

**Examples:**

```http
GET /api/widget/aggregate/articoli?formula={"op":"count"}&window=month
```
```json
{ "value": 14, "window": "month" }
```

```http
GET /api/widget/aggregate/prodotti?formula={"op":"sum","column":"price"}&window=year
```
```json
{ "value": 48920.5, "window": "year" }
```

---

## Growth — `GET /api/widget/growth/:seed`

Runs the formula twice — once for the current period and once for the equivalent previous period — and calculates the percentage delta and trend.

**Window split logic:**

| `window` | Current period | Previous period |
|---|---|---|
| `week` | `> -7 days` | `BETWEEN -14 days AND -7 days` |
| `month` | `> -1 month` | `BETWEEN -2 months AND -1 month` |
| `year` | `> -1 year` | `BETWEEN -2 years AND -1 year` |
| `all` | Entire table | Empty baseline (`previous = 0`) |

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `formula` | JSON string | Yes | — | JSON-encoded `AggregateFormula` |
| `window` | `TimeWindow` | No | `'all'` | Determines the period split boundary |
| `from` / `to` | integer | No | — | Custom date range bounds |

**Response `200`:**

```json
{
  "current": 14,
  "previous": 9,
  "percentageChange": 55.6,
  "trend": "up"
}
```

**Calculation rules:**
- `percentageChange` is rounded to one decimal place (`((current - previous) / previous) * 100`).
- When `previous === 0`:
  - If `current > 0`: `percentageChange = 100`, `trend = "up"`.
  - If `current < 0`: `percentageChange = -100`, `trend = "down"`.
  - If `current === 0`: `percentageChange = 0`, `trend = "flat"`.
- Otherwise: `trend` is `"up"` when `percentageChange > 0`, `"down"` when `< 0`, and `"flat"` when `== 0`.

---

## Leaderboard — `GET /api/widget/leaderboard/:seed`

Returns entries sorted by a numeric column, with labels resolved from `seed.displayNameAlias`.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `scoreColumn` | string (alias) | Yes | — | Field alias to sort and score by |
| `limit` | integer | No | `10` | Max entries (clamped 1–100) |
| `orderDir` | `'asc'` \| `'desc'` | No | `'desc'` | Sort direction |

**Response `200`:**

```json
[
  { "id": "abc123", "label": "Prodotto Alpha", "score": 299.99 },
  { "id": "def456", "label": "Prodotto Beta",  "score": 149.00 }
]
```

Entries where `scoreColumn` is `NULL` are automatically excluded (`WHERE score IS NOT NULL`). `label` falls back to `id` if `displayNameAlias` is absent or the resolved label is null.

---

## List — `GET /api/widget/list/:seed`

Paginated list of entries with optional search, structured filters, and sorting. Branch fields are deserialized from SQLite storage via `deserializeFromDb`, and encrypted Application-Level Encryption (ALE) fields are automatically decrypted for authenticated callers.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `search` | string | No | — | LIKE filter on `displayNameAlias` (`%value%`, with escaped wildcards) |
| `filters` | JSON array | No | — | Array of `{ column, op, value }` filter rules |
| `orderBy` | string (alias) | No | `created_at` | Sort column alias or system column |
| `orderDir` | `'asc'` \| `'desc'` | No | `'asc'` | Sort direction |
| `limit` | integer | No | `25` | Page size (clamped 1–100) |
| `offset` | integer | No | `0` | Pagination offset |

**Supported filter operators (`op`):**

| `op` | SQL Equivalent |
|---|---|
| `eq` or `=` | `= ?` |
| `neq` or `!=` | `!= ?` |
| `like` | `LIKE ?` (wildcard matching) |
| `gt` or `>` | `CAST(col AS REAL) > ?` |
| `lt` or `<` | `CAST(col AS REAL) < ?` |

Unknown operators are silently ignored.

**Response `200`:**

```json
{
  "entries": [
    {
      "id": "abc123",
      "slug": "prodotto-alpha",
      "status": "published",
      "createdAt": 1700000000,
      "updatedAt": 1700001000,
      "title": "Prodotto Alpha",
      "price": 299.99
    }
  ],
  "total": 42
}
```

---

## Timeseries — `GET /api/widget/timeseries/:seed`

Groups entries by a date column formatted as `YYYY-MM-DD` and aggregates a numeric column, returning a time series sequence suitable for charting.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `valueColumn` | string (alias) | Required if formula ≠ `count` | — | Numeric field to aggregate |
| `groupColumn` | string (alias) | No | `created_at` | Date column (stored as unix epoch seconds) |
| `formula` | `'sum'` \| `'avg'` \| `'count'` | No | `'count'` | Aggregation function |
| `window` | `TimeWindow` | No | `'all'` | Time range filter on `groupColumn` |
| `from` / `to` | integer | No | — | Custom date range bounds |

Date buckets are formatted as `YYYY-MM-DD` strings using SQLite's `strftime('%Y-%m-%d', datetime(col, 'unixepoch'))`.

**Response `200`:**

```json
{
  "points": [
    { "label": "2025-01-01", "value": 3 },
    { "label": "2025-01-02", "value": 7 },
    { "label": "2025-01-03", "value": 2 }
  ]
}
```

Points are sorted ascending by date bucket. Dates with no entries are omitted (no zero-fill).

---

## Distribution — `GET /api/widget/distribution/:seed`

Groups entries by a categorical column and returns the count of entries per distinct value, ordered descending by count.

**Query parameters:**

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `column` | string (alias) | Yes | — | Field alias to group by |
| `window` | `TimeWindow` | No | `'all'` | Time range filter on `created_at` |
| `from` / `to` | integer | No | — | Custom date range bounds |
| `limit` | number | No | `8` | Max slices returned (clamped 1–24) |

**Response `200`:**

```json
{
  "slices": [
    { "label": "published", "value": 12 },
    { "label": "draft", "value": 4 },
    { "label": "∅", "value": 1 }
  ]
}
```

`NULL` values are returned under the label `"∅"`. Values beyond `limit` are not merged into an "other" bucket — truncation handling is delegated to the client UI.
