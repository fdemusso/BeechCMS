---
title: Automations API
description: REST API, WhenNode conditions, action schemas (send_mail, webhook, edit_field, create_entry, set_variable), template interpolation, and limits for BeechCMS automations.
keywords: automations, webhook, send_mail, edit_field, create_entry, set_variable, WhenNode, cron, trigger_conditions, template interpolation
---

# Automations API

All automation routes require JWT authentication (same `Authorization: Bearer` header as the content API).

Base path: `/api/automations`

---

## List Automations

**`GET /api/automations?seed=<slug>`**

Returns all automations declared for a seed, ordered by `created_at DESC`.

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `seed` | string | Yes | Seed slug |

**Response `200 OK`:**

```json
[
  {
    "id": "uuid",
    "seed_slug": "articles",
    "name": "Notify on publish",
    "enabled": true,
    "triggers": [
      { "event": "update" }
    ],
    "trigger_conditions": {
      "kind": "predicate",
      "left": { "kind": "ref", "key": "this.status" },
      "op": "eq",
      "right": { "kind": "literal", "value": "published" }
    },
    "actions": [
      { "type": "webhook", "url": "https://example.com/hook", "body_template": "{}" }
    ],
    "created_at": 1700000000,
    "updated_at": 1700000000
  }
]
```

---

## Get Automation

**`GET /api/automations/:id`**

**Response `200 OK`:** Single automation object (same schema as above).

**Response `404 Not Found`:** RFC 7807/9457 Problem Details (`type: 'automation-not-found'`).

---

## Create Automation

**`POST /api/automations`**

**Request body:**

```json
{
  "seed_slug": "articles",
  "name": "Send welcome email",
  "enabled": true,
  "triggers": [
    { "event": "create" }
  ],
  "trigger_conditions": null,
  "actions": [
    {
      "type": "send_mail",
      "to": "user@example.com",
      "subject_template": "Welcome, \{\{this.name\}\}!",
      "body_template": "Your entry has been created."
    }
  ]
}
```

### Trigger Events
The `triggers` array accepts one or more lifecycle events (`create`, `update`, `delete`), and at most one `cron` event:
```json
"triggers": [
  { "event": "create" },
  { "event": "update" }
]
```
When `event` is `'cron'`, `cron` must be a valid cron expression string (e.g. `"0 9 * * 1"` = every Monday at 09:00).

### Trigger Conditions (`WhenNode`)
`trigger_conditions` is either `null` or a structured `WhenNode` tree (`WhenPredicate` or `WhenGroup`):
```json
{
  "kind": "predicate",
  "left": { "kind": "ref", "key": "this.status" },
  "op": "eq",
  "right": { "kind": "literal", "value": "published" }
}
```

### Action Types

| Type | Required Fields | Optional Fields | Notes |
|---|---|---|---|
| `webhook` | `url`, `body_template` | `method` (POST/GET/PUT), `headers` | `url` must be a static `https://` URL (no `\{\{...\}\}` interpolation) and cannot point to private IP ranges (anti-SSRF). `body_template` is required. |
| `send_mail` | `to`, `subject_template`, `body_template` | — | `to` must be a valid email address or contain a `\{\{...\}\}` template placeholder (e.g. `\{\{this.email\}\}`). |
| `edit_field` | `field`, `value` | — | Updates the **triggering entry only** (no parent/sibling seed updates). Refuses localized fields. `value` supports template interpolation when string. |
| `create_entry` | `seed_slug`, `field_map` | — | `field_map` maps `targetField: sourceFieldAlias` (or a literal value; no `\{\{...\}\}` template interpolation) and always creates entries with status `'draft'`. |
| `set_variable` | `name` | `seed_slug`, `fixed_id`, `column`, `filters`, `order_by`, `order` | `fixed_id` and string filter values support template interpolation. |

### Template Interpolation
`send_mail.to`, `body_template`, `subject_template`, `edit_field.value`, `set_variable.fixed_id`, and string `set_variable.filters[].value` support template interpolation:
- Access fields from the triggering entry: <span v-pre>`\{\{this.fieldAlias\}\}`</span> or <span v-pre>`\{\{this:fieldAlias\}\}`</span>
- Access variables declared by `set_variable`: <span v-pre>`\{\{varName.column\}\}`</span> or <span v-pre>`\{\{varName.count\}\}`</span>

For webhook bodies, place placeholders inside JSON string quotes. Substituted values are JSON-escaped, preserving quotes, backslashes, newlines, and other control characters after the receiver parses the body. The surrounding template is unchanged. For example, <span v-pre>`{"note":"\{\{this.note\}\}"}`</span> sends `note` as a string, including when the source value is numeric or boolean.

### Constraints & Limits
- **Triggering entry scope**: `edit_field` only modifies the entry that fired the automation. Use [Lifecycle Hooks](/build/business-rules) (`ctx.repository.mutateField` / `runBatch`) to update a parent or related seed.
- **No arithmetic in templates**: Expressions such as `{{this.stock - 1}}` are not evaluated. Use `mutateField` in a lifecycle hook or custom route for counters.
- **No previous entry values in `WhenNode`**: Conditions evaluate the current state of the entry (`this.*`), `batch`, and literal seed-scoped refs; prior values before an update are not tracked.
- **`set_variable` runs in `actions[]` only**: Variables declared by `set_variable` are not available during `trigger_conditions` evaluation.

**Response `201 Created`:**

```json
{ "id": "uuid" }
```

**Response `400 Bad Request`:** Zod validation failure (`automation-validation-failed`).

---

## Update Automation

**`PUT /api/automations/:id`**

Partial update — only fields present in the body are changed. If `triggers` is supplied, the entire `triggers` array is replaced.

**Response `204 No Content`**

---

## Toggle Automation

**`PATCH /api/automations/:id/toggle`**

Atomic single-field flip.

**Request body:**

```json
{ "enabled": false }
```

**Response `204 No Content`**

---

## Delete Automation

**`DELETE /api/automations/:id`**

**Response `204 No Content`**
