---
title: Drafts & Versioning Workflow
description: Staged draft lifecycle, schema validation, visual diffs, and atomic publishing in BeechCMS.
---

# Drafts & Versioning Workflow

BeechCMS includes a native, edge-optimized **Drafts Engine** that allows content creators to draft, preview, and review changes safely before promoting them to the live public site.

Drafting is enabled per Botanical Seed. When active, edits do not mutate the live database record directly. Instead, pending state is stored in a dedicated staging layer and atomically promoted upon publication.

<p align="center">
  <img src="/images/dual-table-drafts-pipeline.svg" alt="BeechCMS Dual-Table Staging & Drafts Architecture" style="width: 100%; max-width: 860px; margin: 16px 0;" />
</p>

---

## Key Capabilities

- **Isolated Staging**: Modifying an existing record stores changes as a pending draft. Live readers (via the Public API) continue seeing the published snapshot until explicit publication.
- **Unified Drafts Inbox**: A global view (`/drafts` route in the dashboard and `GET /api/content/drafts`) aggregates all pending work across every draft-enabled Seed.
- **Partial Updates & Lenient Validation**: Drafts allow saving incomplete forms without failing strict `required` constraints, while still validating field types and sanitizing dangerous markup (XSS).
- **Referential Guard**: Attempting to publish a draft that references a deleted record fails atomically with a `422 Unprocessable Entity` (`relation-target-not-found`).
- **Audit Trails**: Draft creation, updates, discards, and promotions trigger non-blocking audit events captured by the Activity Logger.

---

## Enabling Drafts on a Seed

To activate the draft workflow for a Seed, set `enableDrafts: true` in your seed definition:

```typescript
import { defineSeed } from '@beechcms/core'

export const ArticleSeed = defineSeed({
  slug: 'articles',
  name: 'Articles',
  enableDrafts: true, // [!code highlight]
  branches: [
    { alias: 'title', type: 'text', required: true },
    { alias: 'slug', type: 'text', required: true, unique: true },
    { alias: 'content', type: 'richtext' },
  ],
})
```

---

## Dashboard Experience

In the BeechCMS Dashboard:

1. **Staged Indicator**: Records with unpublished changes display a yellow **Draft Pending** badge in data tables and Kanban cards.
2. **Drafts Drawer & Comparison**: Clicking on a draft record displays a split-view comparing the live version against the staged draft, highlighting modified fields.
3. **Action Bar**:
   - **Save Draft**: Persists work-in-progress without altering public APIs.
   - **Publish**: Validates all strict rules, commits the draft to the live record, and clears the pending staging entry.
   - **Discard**: Drops the pending draft, reverting the editor back to the current live state.

---

## API Endpoints

The draft workflow is mounted at `/api/content`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/content/drafts` | Returns all pending drafts across all draft-enabled Seeds. |
| `GET` | `/api/content/:slug/:id/draft` | Retrieves the staging draft for a specific Fruit. |
| `PUT` | `/api/content/:slug/:id/draft` | Creates or updates the staging draft for a specific Fruit. |
| `POST` | `/api/content/:slug/:id/draft/publish` | Promotes the staged draft to live atomically. |
| `DELETE` | `/api/content/:slug/:id/draft` | Discards the staged draft without touching the live record. |

### Saving a Draft

```bash
curl -X PUT https://api.yourdomain.com/api/content/articles/art_01HXYZ/draft \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Upcoming Release v2.0 (Work in progress)",
    "content": { "type": "doc", "content": [...] }
  }'
```

Response:
```json
{
  "success": true
}
```

### Publishing a Draft

```bash
curl -X POST https://api.yourdomain.com/api/content/articles/art_01HXYZ/draft/publish \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

Response:
```json
{
  "success": true
}
```

If a referenced relation was deleted in the meantime, the API guarantees consistency:

```json
{
  "type": "relation-target-not-found",
  "title": "Relation Target Not Found",
  "status": 422,
  "detail": "Field 'author' references 'authors' id='auth_999' which does not exist"
}
```

---

## Draft Guard & Sensitive Fields

To ensure security and compliance:
- **Sensitive Fields Restriction**: Fields governed by `confidential` or `encrypted` policies cannot be modified via draft staging (`422 content-sensitive-field-edit`). Sensitive fields must be edited directly through authorized, immediate mutations.
- **Seed Guard**: Requests to draft endpoints on a Seed with `enableDrafts: false` return `403 Forbidden` (`Seed does not support drafts`).
