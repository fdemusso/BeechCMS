[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / MediaRepository

# Interface: MediaRepository

## Methods

### count()

> **count**(): `Promise`&lt;`number`&gt;

Gets the total number of tracked media objects.

#### Returns

`Promise`&lt;`number`&gt;

***

### getByKey()

> **getByKey**(`key`): `Promise`&lt;[`MediaObject`](MediaObject.md) \| `null`&gt;

Retrieves tracking info for a file by its key.

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;[`MediaObject`](MediaObject.md) \| `null`&gt;

***

### list()

> **list**(`options`): `Promise`&lt;\{ `items`: [`MediaObject`](MediaObject.md)[]; `total`: `number`; \}&gt;

Lists all tracked media with pagination.

#### Parameters

##### options

###### limit

`number`

###### offset

`number`

#### Returns

`Promise`&lt;\{ `items`: [`MediaObject`](MediaObject.md)[]; `total`: `number`; \}&gt;

***

### trackUpload()

> **trackUpload**(`media`): `Promise`&lt;`void`&gt;

Tracks a new file upload in the database.

#### Parameters

##### media

`Omit`&lt;[`MediaObject`](MediaObject.md), `"created_at"`&gt;

#### Returns

`Promise`&lt;`void`&gt;

***

### untrack()

> **untrack**(`key`): `Promise`&lt;`void`&gt;

Removes tracking info for a file.

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;`void`&gt;
