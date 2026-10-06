[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ISeedMediaPurgeRepository

# Interface: ISeedMediaPurgeRepository

Durable, bounded staging and acknowledgement of media references during seed deletion.

## Methods

### abortDrop()

> **abortDrop**(`id`, `token`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### begin()

> **begin**(`id`, `seed`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### seed

[`Seed`](Seed.md)

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### claim()

> **claim**(`id`, `token`, `now`, `leaseSeconds`): `Promise`&lt;[`SeedPurgeJob`](SeedPurgeJob.md) \| `null`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### now

`number`

##### leaseSeconds

`number`

#### Returns

`Promise`&lt;[`SeedPurgeJob`](SeedPurgeJob.md) \| `null`&gt;

***

### completeKey()

> **completeKey**(`id`, `token`, `key`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### key

`string`

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### dropAndStartPurge()

> **dropAndStartPurge**(`id`, `token`, `statements`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### statements

`string`[]

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### finish()

> **finish**(`id`, `token`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### get()

> **get**(`id`): `Promise`&lt;[`SeedPurgeJob`](SeedPurgeJob.md) \| `null`&gt;

#### Parameters

##### id

`string`

#### Returns

`Promise`&lt;[`SeedPurgeJob`](SeedPurgeJob.md) \| `null`&gt;

***

### getActiveBySlug()

> **getActiveBySlug**(`slug`): `Promise`&lt;[`SeedPurgeJob`](SeedPurgeJob.md) \| `null`&gt;

#### Parameters

##### slug

`string`

#### Returns

`Promise`&lt;[`SeedPurgeJob`](SeedPurgeJob.md) \| `null`&gt;

***

### getColumns()

> **getColumns**(`table`): `Promise`&lt;`Set`&lt;`string`&gt; \| `null`&gt;

#### Parameters

##### table

`string`

#### Returns

`Promise`&lt;`Set`&lt;`string`&gt; \| `null`&gt;

***

### listKeys()

> **listKeys**(`id`, `limit`): `Promise`&lt;`string`[]&gt;

#### Parameters

##### id

`string`

##### limit

`number`

#### Returns

`Promise`&lt;`string`[]&gt;

***

### listPendingIds()

> **listPendingIds**(`limit`): `Promise`&lt;`string`[]&gt;

#### Parameters

##### limit

`number`

#### Returns

`Promise`&lt;`string`[]&gt;

***

### moveToDrafts()

> **moveToDrafts**(`id`, `token`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;

***

### readPage()

> **readPage**(`table`, `columns`, `cursor`, `limit`): `Promise`&lt;[`SeedPurgeRow`](SeedPurgeRow.md)[]&gt;

#### Parameters

##### table

`string`

##### columns

`string`[]

##### cursor

`number`

##### limit

`number`

#### Returns

`Promise`&lt;[`SeedPurgeRow`](SeedPurgeRow.md)[]&gt;

***

### release()

> **release**(`id`, `token`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### stagePage()

> **stagePage**(`id`, `token`, `cursor`, `keys`, `now`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### token

`string`

##### cursor

`number`

##### keys

`string`[]

##### now

`number`

#### Returns

`Promise`&lt;`void`&gt;
