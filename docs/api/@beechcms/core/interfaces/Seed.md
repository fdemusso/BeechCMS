[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / Seed

# Interface: Seed

Seed: schema definition of a content type.

## Properties

### allowDrafts?

> `optional` **allowDrafts?**: `boolean`

Enables the "pending draft" feature for this seed.
When true, generates the `content_{slug}_drafts` table and enables the `/draft` endpoints.
Default: false.

***

### allowPublicEdit?

> `optional` **allowPublicEdit?**: `boolean`

Enable edits from the Public API (`PUT /api/v1/public/:seed/edit/:id`). Default: false.

***

### allowPublicPost?

> `optional` **allowPublicPost?**: `boolean`

Enable creation from the Public API (`POST /api/v1/public/:seed/add`). Default: false.

***

### allowPublicRead?

> `optional` **allowPublicRead?**: `boolean`

Enable reads from the Public API (`GET /api/v1/public/:seed`). Default: false.

***

### branches

> **branches**: [`Branch`](Branch.md)[]

List of fields (Branch).

***

### dashboard?

> `optional` **dashboard?**: [`DashboardSeedConfig`](DashboardSeedConfig.md)

Optional dashboard-specific UI config. Ignored by the Botanical Engine.

***

### displayNameAlias

> **displayNameAlias**: `string`

Alias of the branch used as the entry's human-readable name (e.g. "title", "name", "author").
Required — UIs use it for display without heuristics.

***

### label

> **label**: `string`

Singular UI label.

***

### labelPlural?

> `optional` **labelPlural?**: `string`

Plural UI label. Falls back to `label` when absent.

***

### layout?

> `optional` **layout?**: `unknown`

Custom editor form layout. Absent when no override is stored.
 Populated server-side by GET /api/schema. Ignored by the Botanical Engine.
 Type matches FormLayout from seed-layout.ts — kept as unknown here to avoid circular imports.

***

### retentionDays?

> `optional` **retentionDays?**: `number`

Number of days to retain entries before automatic cleanup or anonymization (GDPR compliance).
Must be a positive integer (\>= 1) when specified.

***

### slug

> **slug**: `string`

Identifying slug — also the table name: `content_{slug}`.
