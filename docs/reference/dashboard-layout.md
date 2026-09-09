# Dashboard Layout API

Persists the **Dashboard Composer** layout shown on the Cockpit dashboard, backed by the `dashboard_layouts` table (one row per `scope`). Scopes form a closed set: `'default' | 'role:admin' | 'role:editor'` (see `KNOWN_DASHBOARD_ROLES` / `isValidDashboardScope` in `@beechcms/core`).

On save, the server validates the Zod shape (`dashboardLayoutSchema`) and semantic constraints: widgets whose `config.seedSlug` references a deleted seed are silently dropped (reported via `warnings`); unknown/custom widget types (e.g. `@acme/ghost`) pass through unchanged.

---

## `GET /api/dashboard-layout`

Returns the layout for the caller, resolved server-side by walking the
caller's **scope chain** (from `resolveDashboardScopeChain(jwtPayload.role)`):

| Caller role | Chain |
|---|---|
| `editor` | `role:editor` → `default` |
| `admin` | `role:admin` → `default` |
| other/missing | `default` |

The first scope in the chain with a stored row wins; its (auto-cleaned)
layout and the winning `scope` are returned. If nothing is stored anywhere,
returns `{ "scope": "default", "layout": null }` and the dashboard
regenerates its default layout client-side. Any authenticated user may call this.

**Request**
```http
GET /api/dashboard-layout
Authorization: Bearer eyJ...
```

**Response `200`** — no row stored anywhere
```json
{ "scope": "default", "layout": null }
```

**Response `200`** — stored layout (e.g. an editor with their own `role:editor` row)
```json
{
  "scope": "role:editor",
  "layout": {
    "version": 1,
    "pages": [
      {
        "id": "page-1",
        "slug": "overview",
        "label": "Overview",
        "icon": "LayoutDashboard",
        "sections": [
          {
            "id": "section-1",
            "columns": [
              { "id": "col-1", "widgets": [{ "id": "w1", "type": "core/stat", "config": {} }] }
            ]
          }
        ]
      }
    ]
  }
}
```

> Auto-cleanup is read-time only — the cleaned result is **not** written back. Persistence catches up on the next admin save.

---

## `PUT /api/dashboard-layout`

Upserts the layout for the `'default'` scope (bare route — backwards
compatible with Sprint 05). Requires the `admin` role (`canEditDashboard`).

**Request**
```http
PUT /api/dashboard-layout
Authorization: Bearer eyJ...
Content-Type: application/json

{
  "version": 1,
  "pages": [ /* DashboardPageLayout[] */ ]
}
```

**Response `200`**
```json
{
  "ok": true,
  "layout": { "version": 1, "pages": [ /* cleaned */ ] },
  "warnings": []
}
```

`warnings` surfaces non-blocking notices to the builder — e.g. a widget bound via `config.seedSlug` referenced a seed that no longer exists, so it was dropped from `layout` before storing.

**Errors**

| `type` slug | HTTP Status | Meaning |
|---|---|---|
| `forbidden` | `403` | Caller role is not `admin`. |
| `invalid-json` | `400` | Request body is not valid JSON. |
| `invalid-layout` | `422` | Body fails `dashboardLayoutSchema` Zod shape, or fails semantic validation (duplicate widget IDs, duplicate page slugs, `columnSpans` not summing to 12, or widget `config` over 8 KB). |

---

## `DELETE /api/dashboard-layout`

Removes the stored row for the `'default'` scope ("Reset", bare route).
Requires the `admin` role (`canEditDashboard`). The next `GET` returns
`{ "scope": "default", "layout": null }` and the dashboard regenerates its
default layout client-side.

**Request**
```http
DELETE /api/dashboard-layout
Authorization: Bearer eyJ...
```

**Response `200`**
```json
{ "ok": true }
```

---

## Scoped Dashboard Layout Routes

All admin-only. `:scope` must be one of the closed set `'default' | 'role:admin' | 'role:editor'`
(`isValidDashboardScope`); an unknown scope returns a `400 invalid-scope` problem.

### `GET /api/dashboard-layout/:scope`

Returns the **raw stored** layout for `:scope` (auto-cleaned), or
`{ "scope": "<scope>", "layout": null }` if nothing is stored — used by the
builder to load a scope's draft without applying the read-resolution chain.

```http
GET /api/dashboard-layout/role:editor
Authorization: Bearer eyJ...
```
```json
{ "scope": "role:editor", "layout": null }
```

### `PUT /api/dashboard-layout/:scope`

Upserts the layout for `:scope`. Same validation and response shape as
`PUT /api/dashboard-layout` (the `'default'`-only bare route).

```http
PUT /api/dashboard-layout/role:editor
Authorization: Bearer eyJ...
Content-Type: application/json

{ "version": 1, "pages": [ /* DashboardPageLayout[] */ ] }
```
```json
{ "ok": true, "layout": { "version": 1, "pages": [ /* cleaned */ ] }, "warnings": [] }
```

### `DELETE /api/dashboard-layout/:scope`

Removes the stored row for `:scope` ("Reset").

```http
DELETE /api/dashboard-layout/role:editor
Authorization: Bearer eyJ...
```
```json
{ "ok": true }
```

---

## `GET /api/dashboard-layout/scopes`

Admin-only. Lists the closed set of dashboard scopes annotated with whether
each currently has a stored row — builder furniture for the scope switcher.

**Request**
```http
GET /api/dashboard-layout/scopes
Authorization: Bearer eyJ...
```

**Response `200`**
```json
[
  { "scope": "default", "stored": true },
  { "scope": "role:admin", "stored": false },
  { "scope": "role:editor", "stored": true }
]
```
