[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IDeletionLedger

# Interface: IDeletionLedger

Append-only erasure log. `append` must be durable before the caller reports success:
a purge whose event was lost is a purge that a restore can silently undo.

## Methods

### append()

> **append**(`event`): `Promise`&lt;`void`&gt;

Records one erasure. Throws if the write did not land.

#### Parameters

##### event

[`DeletionLedgerEvent`](DeletionLedgerEvent.md)

#### Returns

`Promise`&lt;`void`&gt;

***

### list()

> **list**(`seedSlug`, `options?`): `Promise`&lt;\{ `events`: [`DeletionLedgerEvent`](DeletionLedgerEvent.md)[]; `nextCursor?`: `string`; \}&gt;

Streams recorded erasures for one seed, newest-first is NOT guaranteed.
`cursor` is opaque and comes from the previous page's `nextCursor`.

#### Parameters

##### seedSlug

`string`

##### options?

###### cursor?

`string`

###### limit?

`number`

#### Returns

`Promise`&lt;\{ `events`: [`DeletionLedgerEvent`](DeletionLedgerEvent.md)[]; `nextCursor?`: `string`; \}&gt;
