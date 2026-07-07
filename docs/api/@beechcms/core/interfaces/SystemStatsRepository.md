[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / SystemStatsRepository

# Interface: SystemStatsRepository

SystemStatsRepository - Interface for managing global system metrics.

## Methods

### decrementStorage()

> **decrementStorage**(`bytes`): `Promise`&lt;`void`&gt;

Decrements the total storage counter.

#### Parameters

##### bytes

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### getStorageUsage()

> **getStorageUsage**(): `Promise`&lt;`number`&gt;

Gets the current total storage usage in bytes.

#### Returns

`Promise`&lt;`number`&gt;

***

### incrementStorage()

> **incrementStorage**(`bytes`): `Promise`&lt;`void`&gt;

Increments the total storage counter.

#### Parameters

##### bytes

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### setStorage()

> **setStorage**(`bytes`): `Promise`&lt;`void`&gt;

Sets a specific value for a storage stat (e.g. after a full sync).

#### Parameters

##### bytes

`number`

#### Returns

`Promise`&lt;`void`&gt;
