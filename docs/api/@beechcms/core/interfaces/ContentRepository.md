[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ContentRepository

# Interface: ContentRepository

Interface defining the standard operations for content persistence.
This is platform-agnostic and should be implemented for specific databases (e.g., D1).

## Methods

### bulkUpdate()

> **bulkUpdate**(`seed`, `ids`, `fields`): `Promise`&lt;\{ `failed`: `object`[]; `updated`: `number`; \}&gt;

Apply the same field update to many entries. Returns per-id outcome.
Caller is responsible for validation; this method assumes the payload is
already shape-checked against the seed.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### ids

`string`[]

##### fields

`Record`&lt;`string`, [`BulkFieldUpdate`](../type-aliases/BulkFieldUpdate.md)&gt;

#### Returns

`Promise`&lt;\{ `failed`: `object`[]; `updated`: `number`; \}&gt;

***

### create()

> **create**(`seed`, `id`, `slug`, `status`, `data`, `options?`): `Promise`&lt;`void`&gt;

Creates a new content entry in the live table.
Throws SlugConflictError if the slug is already taken.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### id

`string`

##### slug

`string`

##### status

`string`

##### data

`Record`&lt;`string`, `any`&gt;

##### options?

[`RepositoryOptions`](RepositoryOptions.md)

#### Returns

`Promise`&lt;`void`&gt;

***

### delete()

> **delete**(`seed`, `id`, `options?`): `Promise`&lt;\{ `row`: `Record`&lt;`string`, `any`&gt;; \}&gt;

Deletes an entry from the live table.
Returns the deleted row data (useful for media cleanup).
Throws EntryNotFoundError if the ID does not exist.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### id

`string`

##### options?

[`RepositoryOptions`](RepositoryOptions.md)

#### Returns

`Promise`&lt;\{ `row`: `Record`&lt;`string`, `any`&gt;; \}&gt;

***

### deleteDraft()

> **deleteDraft**(`seed`, `entryId`): `Promise`&lt;`void`&gt;

Discards the pending draft.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### existsSlug()

> **existsSlug**(`seed`, `slug`, `excludeId?`): `Promise`&lt;`boolean`&gt;

Checks if a slug is already taken by another entry.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### slug

`string`

##### excludeId?

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### findById()

> **findById**(`seed`, `id`): `Promise`&lt;`Record`&lt;`string`, `any`&gt;&gt;

Finds a single entry by its unique ID.
Throws EntryNotFoundError if not found.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### id

`string`

#### Returns

`Promise`&lt;`Record`&lt;`string`, `any`&gt;&gt;

***

### findBySlug()

> **findBySlug**(`seed`, `slug`): `Promise`&lt;`Record`&lt;`string`, `any`&gt;&gt;

Finds a single entry by its unique slug.
Throws EntryNotFoundError if not found.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### slug

`string`

#### Returns

`Promise`&lt;`Record`&lt;`string`, `any`&gt;&gt;

***

### findMany()

> **findMany**(`seed`, `options`): `Promise`&lt;\{ `items`: `Record`&lt;`string`, `any`&gt;[]; `total`: `number`; \}&gt;

Retrieves a paginated and filtered list of entries.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### options

[`SelectOptions`](SelectOptions.md)

#### Returns

`Promise`&lt;\{ `items`: `Record`&lt;`string`, `any`&gt;[]; `total`: `number`; \}&gt;

***

### findPendingDrafts()

> **findPendingDrafts**(`seeds`): `Promise`&lt;[`DraftSummary`](DraftSummary.md)[]&gt;

Aggregates pending drafts across every draft-enabled seed in a single round-trip.
Exists so the unified /drafts view never issues one query per seed.

#### Parameters

##### seeds

[`Seed`](Seed.md)[]

The draft-enabled seeds to scan (caller passes seedRegistry.draftEnabled()).

#### Returns

`Promise`&lt;[`DraftSummary`](DraftSummary.md)[]&gt;

Drafts newest-first; empty array when no seeds or no drafts.

***

### getDraft()

> **getDraft**(`seed`, `entryId`): `Promise`&lt;`Record`&lt;`string`, `any`&gt; \| `null`&gt;

Retrieves the pending draft for a given entry.
Returns null if no draft exists.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

#### Returns

`Promise`&lt;`Record`&lt;`string`, `any`&gt; \| `null`&gt;

***

### getFacets()

> **getFacets**(`seed`): `Promise`&lt;\{ `statuses`: `Record`&lt;`string`, `number`&gt;; `tagsByColumn`: `Record`&lt;`string`, `string`[]&gt;; \}&gt;

Computes facets (status counts and distinct tags) for a content type.

#### Parameters

##### seed

[`Seed`](Seed.md)

#### Returns

`Promise`&lt;\{ `statuses`: `Record`&lt;`string`, `number`&gt;; `tagsByColumn`: `Record`&lt;`string`, `string`[]&gt;; \}&gt;

***

### hasDraft()

> **hasDraft**(`seed`, `entryId`): `Promise`&lt;`boolean`&gt;

Checks if an entry has a pending draft.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### mutateField()

> **mutateField**(`seed`, `id`, `fieldName`, `operation`, `options?`): `Promise`&lt;\{ `newValue`: `number`; \}&gt;

Atomically increments/decrements a numeric field with optional min/max guards.
Bypasses document-level lifecycle hooks — it's a single UPDATE statement,
used to prevent race conditions on counters (stock, balances).
Throws RepositoryError if `fieldName` is not a numeric branch of `seed`, or
if the guard conditions fail / the row does not exist.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### id

`string`

##### fieldName

`string`

##### operation

###### type

`"increment"` \| `"decrement"`

###### value

`number`

##### options?

###### max?

`number`

###### min?

`number`

#### Returns

`Promise`&lt;\{ `newValue`: `number`; \}&gt;

***

### publishDraft()

> **publishDraft**(`seed`, `entryId`): `Promise`&lt;`void`&gt;

Atomic promotion of a draft to the live table.
Must use a transaction (db.batch) to update live and delete draft.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### runBatch()

> **runBatch**(`operations`): `Promise`&lt;`void`&gt;

Executes a list of write operations atomically via a single `db.batch`.
Document-level lifecycle hooks do NOT run for operations inside this call.

#### Parameters

##### operations

[`BatchWrite`](../type-aliases/BatchWrite.md)[]

#### Returns

`Promise`&lt;`void`&gt;

***

### saveDraft()

> **saveDraft**(`seed`, `entryId`, `data`): `Promise`&lt;`void`&gt;

Saves or updates a pending draft in the mirror table.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### entryId

`string`

##### data

`Record`&lt;`string`, `any`&gt;

#### Returns

`Promise`&lt;`void`&gt;

***

### update()

> **update**(`seed`, `id`, `data`, `status?`, `options?`): `Promise`&lt;`void`&gt;

Partially updates an existing entry in the live table.
Throws EntryNotFoundError if the ID does not exist.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### id

`string`

##### data

`Record`&lt;`string`, `any`&gt;

##### status?

`string`

##### options?

[`RepositoryOptions`](RepositoryOptions.md)

#### Returns

`Promise`&lt;`void`&gt;

***

### updateWithKanbanPosition()

> **updateWithKanbanPosition**(`seed`, `id`, `patch`, `position`, `axisBranchId`, `ctx`): `Promise`&lt;\{ `success`: `boolean`; \}&gt;

Atomically applies an axis-value patch AND a kanban_positions upsert in one DB batch (KB-S04e).
`patch` is null for same-column reorders (position only).

#### Parameters

##### seed

[`Seed`](Seed.md)

##### id

`string`

##### patch

`Record`&lt;`string`, `unknown`&gt; \| `null`

##### position

`string`

##### axisBranchId

`string`

##### ctx

###### actor

`string`

#### Returns

`Promise`&lt;\{ `success`: `boolean`; \}&gt;
