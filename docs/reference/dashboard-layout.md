# Dashboard Layout API

Persists the **Dashboard Composer** layout shown on the Cockpit dashboard, backed by the `dashboard_layouts` table. There is exactly one layout, stored under the `'default'` scope (`DEFAULT_DASHBOARD_SCOPE` in `@beechcms/core`). Rows under any other scope are ignored.

On save, the server validates the Zod shape (`dashboardLayoutSchema`) and semantic constraints: widgets whose `config.seedSlug` references a deleted seed are silently dropped (reported via `warnings`); unknown/custom widget types (e.g. `@acme/ghost`) pass through unchanged.

## Who may do what

| Capability | Required authority |
|---|---|
| Read the layout | Any authenticated user. The body is projected per caller. |
| Edit tab **content** (sections, columns, widgets) | `manage_layout` or `manage_roles`, held at the global scope (`*`). |
| Edit tab **structure** (add, remove, reorder tabs; change a tab's `id`, `slug`, `label`, `icon` or `roles`) and the first save | `manage_roles` at `*`. |
| Reset the layout | `manage_roles` at `*`. |
| List roles for the audience picker | `manage_roles` at `*`. |

A seed-scoped grant of `manage_layout` confers nothing on the dashboard.

## Versioning

Every stored layout carries a version, `updatedAt` (unix seconds). It strictly increases on every write, even when two writes land in the same second. A client echoes the version it loaded as a precondition on every `PUT` and `DELETE`:

| Header | Meaning |
|---|---|
| `If-Match: "<updatedAt>"` | Write only while the stored version equals `<updatedAt>` (weak or strong, quoted or bare). |
| `If-None-Match: *` | Write only while nothing is stored. |

`If-Match` wins when both headers are present. A request carrying neither is refused with `428`, and a stale or lost race with `409 layout-conflict`.

---

## `GET /api/dashboard-layout`

Returns the layout projected for the caller, with its `updatedAt` version. The response is `Cache-Control: no-store` because the body is per-caller.

| Caller | Tabs | Widgets the caller cannot use |
|---|---|---|
| Layout editor (`manage_layout@*` or `manage_roles@*`) | Every tab, in stored order, with `roles` intact. Empty sections are kept. | Replaced in place by a placeholder. |
| Anyone else | Only tabs with no `roles`, or whose `roles` include a role the caller holds through an active assignment. The `roles` key is removed. | Dropped, then sections and tabs that this emptied are dropped. |

A widget is unusable when it is a placeholder, when its `config.seedSlug` names a seed the caller may not `content:read`, or when it is a built-in whose requirement the caller does not meet (for example `core/setup-checklist` without `manage_users@*`). A custom widget's own `requires` is client-side only.

The placeholder carries nothing but the original widget id, so it reveals no type, title or seed:

```json
{ "id": "w-locked", "type": "core/locked", "config": {} }
```

**Request**
```http
GET /api/dashboard-layout
Authorization: Bearer eyJ...
```

**Response `200`** — nothing stored; the dashboard regenerates its default layout client-side
```json
{ "layout": null, "updatedAt": null }
```

**Response `200`** — stored layout
```json
{
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
  },
  "updatedAt": 1767225600
}
```

> Auto-cleanup is read-time only — the cleaned result is **not** written back. Persistence catches up on the next save.

---

## `GET /api/dashboard-layout/roles`

Lists every role as `{ id, name, icon }`, for the tab audience picker. Requires `manage_roles` at `*`. `Cache-Control: no-store`.

**Response `200`**
```json
[
  { "id": "0f3c...", "name": "Editor", "icon": "Store" },
  { "id": "9a1d...", "name": "SuperAdmin", "icon": "Shield" }
]
```

---

## `PUT /api/dashboard-layout`

Replaces the stored layout. The route admits a caller holding `manage_layout` or `manage_roles` on any scope; the handler then requires one of them at `*`.

The handler checks, in this order:

1. The caller holds `manage_layout@*` or `manage_roles@*`.
2. A precondition header is present.
3. The body passes semantic validation (seeds, role ids, duplicate ids).
4. The precondition equals the stored `updatedAt` (`null` when nothing is stored).
5. A caller without `manage_roles@*` changes no tab structure, and does not save over nothing.
6. Locked widgets are reconciled: each widget the caller cannot use is taken back verbatim from the stored layout. A placeholder sent back in its own column is replaced by the stored widget, and moving, removing or forging one is refused. Locked widgets of a tab the caller deleted are dropped with it.
7. The layout is written with a conditional statement, so a concurrent writer cannot slip in between steps 4 and 7.

**Request**
```http
PUT /api/dashboard-layout
Authorization: Bearer eyJ...
Content-Type: application/json
If-Match: "1767225600"

{
  "version": 1,
  "pages": [ /* DashboardPageLayout[] */ ]
}
```

**Response `200`**
```json
{
  "ok": true,
  "layout": { "version": 1, "pages": [ /* cleaned, projected for the caller */ ] },
  "warnings": [],
  "updatedAt": 1767225601
}
```

`layout` is the same projection `GET` serves, never the raw stored layout: re-injected locked widgets come back as placeholders. `warnings` surfaces non-blocking notices — e.g. a widget bound via `config.seedSlug` referenced a seed that no longer exists, so it was dropped before storing.

**Errors**

| `type` slug | HTTP Status | Meaning |
|---|---|---|
| `forbidden` | `403` | The route table refused the caller: they hold neither permission on any scope. |
| `layout-edit-forbidden` | `403` | The caller holds `manage_layout` or `manage_roles`, but not at `*`. |
| `layout-structure-forbidden` | `403` | A caller without `manage_roles@*` changed the tab set, order or metadata, or saved when nothing is stored. |
| `precondition-required` | `428` | Neither a parsable `If-Match` nor `If-None-Match: *` was sent. |
| `layout-conflict` | `409` | The stored `updatedAt` differs from the precondition, or the conditional write lost a race. Reload and apply the change again. |
| `invalid-json` | `400` | Request body is not valid JSON. |
| `invalid-layout` | `422` | Body fails `dashboardLayoutSchema`, fails semantic validation (duplicate widget IDs, duplicate page slugs, unknown role id, `columnSpans` not summing to 12, widget `config` over 8 KB), or violates a locked widget (moved, removed, forged, or an unusable widget added). The detail names widget ids only. |

---

## `DELETE /api/dashboard-layout`

Removes the stored row ("Reset"). Requires `manage_roles` at `*`; reset is structural, so it is allowed even over widgets the caller cannot use. It needs the same precondition as `PUT`; with `If-None-Match: *` and nothing stored it succeeds as a no-op. The next `GET` returns `{ "layout": null, "updatedAt": null }` and the dashboard regenerates its default layout client-side.

**Request**
```http
DELETE /api/dashboard-layout
Authorization: Bearer eyJ...
If-Match: "1767225600"
```

**Response `200`**
```json
{ "ok": true }
```

**Errors**

| `type` slug | HTTP Status | Meaning |
|---|---|---|
| `forbidden` | `403` | Caller does not hold `manage_roles` at `*`. |
| `precondition-required` | `428` | Neither a parsable `If-Match` nor `If-None-Match: *` was sent. |
| `layout-conflict` | `409` | The stored `updatedAt` differs from the precondition. |
