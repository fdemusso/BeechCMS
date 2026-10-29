[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / BeechBucket

# Interface: BeechBucket

## Methods

### delete()

> **delete**(`key`): `Promise`&lt;`void`&gt;

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### get()

> **get**(`key`): `Promise`&lt;[`GetBucketResult`](GetBucketResult.md) \| `null`&gt;

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;[`GetBucketResult`](GetBucketResult.md) \| `null`&gt;

***

### getTotalSize()

> **getTotalSize**(): `Promise`&lt;`number`&gt;

#### Returns

`Promise`&lt;`number`&gt;

***

### getUrl()

> **getUrl**(`key`): `string`

#### Parameters

##### key

`string`

#### Returns

`string`

***

### head()

> **head**(`key`): `Promise`&lt;\{ `contentType?`: `string`; `metadata?`: `Record`&lt;`string`, `string`&gt;; `size`: `number`; \} \| `null`&gt;

#### Parameters

##### key

`string`

#### Returns

`Promise`&lt;\{ `contentType?`: `string`; `metadata?`: `Record`&lt;`string`, `string`&gt;; `size`: `number`; \} \| `null`&gt;

***

### list()

> **list**(`options?`): `Promise`&lt;\{ `cursor?`: `string`; `objects`: `object`[]; \}&gt;

#### Parameters

##### options?

###### cursor?

`string`

###### limit?

`number`

###### prefix?

`string`

#### Returns

`Promise`&lt;\{ `cursor?`: `string`; `objects`: `object`[]; \}&gt;

***

### presignGet()

> **presignGet**(`key`, `options`): `Promise`&lt;`string`&gt;

Generates a signed URL for direct read (GET).

#### Parameters

##### key

`string`

##### options

[`PresignOptions`](PresignOptions.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### presignPut()

> **presignPut**(`key`, `options`): `Promise`&lt;`string`&gt;

Generates a signed URL for direct upload (PUT).

#### Parameters

##### key

`string`

##### options

[`PresignOptions`](PresignOptions.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### put()

> **put**(`key`, `body`, `options?`): `Promise`&lt;`void`&gt;

#### Parameters

##### key

`string`

##### body

`ArrayBuffer` \| `Uint8Array`&lt;`ArrayBufferLike`&gt; \| `ReadableStream`&lt;`any`&gt;

##### options?

[`PutBucketOptions`](PutBucketOptions.md)

#### Returns

`Promise`&lt;`void`&gt;
