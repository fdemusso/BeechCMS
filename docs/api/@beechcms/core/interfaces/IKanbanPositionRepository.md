[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IKanbanPositionRepository

# Interface: IKanbanPositionRepository

Persistence contract for card ordering. The ONLY gateway to `kanban_positions`.
Handlers and the dashboard never touch the table directly (Botanical invariant).

## Methods

### getColumn()

> **getColumn**(`seedSlug`, `axisBranchId`): `Promise`&lt;`Map`&lt;`string`, `string`&gt;&gt;

entryId → position for one column axis (entries without a row are omitted).

#### Parameters

##### seedSlug

`string`

##### axisBranchId

`string`

#### Returns

`Promise`&lt;`Map`&lt;`string`, `string`&gt;&gt;

***

### rebalance()

> **rebalance**(`seedSlug`, `axisBranchId`, `ordered`): `Promise`&lt;`void`&gt;

Async rebalance (KB-S04f): rewrite a whole column's positions in one batch.

#### Parameters

##### seedSlug

`string`

##### axisBranchId

`string`

##### ordered

[`KanbanPositionRecord`](KanbanPositionRecord.md)[]

#### Returns

`Promise`&lt;`void`&gt;

***

### remove()

> **remove**(`seedSlug`, `entryId`, `axisBranchId`): `Promise`&lt;`void`&gt;

Remove an entry's position row (e.g. entry deleted).

#### Parameters

##### seedSlug

`string`

##### entryId

`string`

##### axisBranchId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### setPosition()

> **setPosition**(`seedSlug`, `entryId`, `axisBranchId`, `position`): `Promise`&lt;`void`&gt;

Single-row upsert — exactly one write per drag (KB-S04b).

#### Parameters

##### seedSlug

`string`

##### entryId

`string`

##### axisBranchId

`string`

##### position

`string`

#### Returns

`Promise`&lt;`void`&gt;
