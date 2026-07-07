[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ISeedRepository

# Interface: ISeedRepository

Persistence contract for runtime Seed definitions.
Implemented by D1SeedRepository in apps/api/src/shared/seed.repository.d1.ts.

`listActive()` returns only status='active' rows — this is what the registry is
hydrated from. `getRegistryVersion` / `bumpRegistryVersion` back the multi-isolate
cache token (see docs/Sprints/runtime-seeds/00-overview.md).

## Methods

### bumpRegistryVersion()

> **bumpRegistryVersion**(): `Promise`&lt;`number`&gt;

Atomically increment and return the new token. Call after any write.

#### Returns

`Promise`&lt;`number`&gt;

***

### get()

> **get**(`slug`): `Promise`&lt;[`SeedRecord`](SeedRecord.md) \| `null`&gt;

Single active-or-deleted record by slug, or null.

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;[`SeedRecord`](SeedRecord.md) \| `null`&gt;

***

### getRegistryVersion()

> **getRegistryVersion**(): `Promise`&lt;`number`&gt;

Current cache token.

#### Returns

`Promise`&lt;`number`&gt;

***

### hardDelete()

> **hardDelete**(`slug`): `Promise`&lt;`void`&gt;

Hard-delete (sprint 06): permanently remove the `seeds` row. The caller is
 responsible for dropping the backing tables first via ISchemaMutator.

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### listActive()

> **listActive**(): `Promise`&lt;[`Seed`](Seed.md)[]&gt;

All active seed definitions, ordered by created_at ASC.

#### Returns

`Promise`&lt;[`Seed`](Seed.md)[]&gt;

***

### listAll()

> **listAll**(): `Promise`&lt;[`SeedRecord`](SeedRecord.md)[]&gt;

Every row including soft-deleted ones (for admin/diff use).

#### Returns

`Promise`&lt;[`SeedRecord`](SeedRecord.md)[]&gt;

***

### softDelete()

> **softDelete**(`slug`): `Promise`&lt;`void`&gt;

Soft-delete: set status='deleted'. Table is NOT dropped (additive-only).

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### upsert()

> **upsert**(`slug`, `definition`, `source?`): `Promise`&lt;`void`&gt;

Insert or replace a definition. Sets source on insert; preserves it on update unless given.

#### Parameters

##### slug

`string`

##### definition

[`Seed`](Seed.md)

##### source?

`"code"` \| `"runtime"`

#### Returns

`Promise`&lt;`void`&gt;
