[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/search-client](../index.md) / SearchClient

# Class: SearchClient

## Constructors

### Constructor

> **new SearchClient**(`apiOrigin`, `options?`): `SearchClient`

#### Parameters

##### apiOrigin

`string`

##### options?

[`SearchClientOptions`](../interfaces/SearchClientOptions.md)

#### Returns

`SearchClient`

## Methods

### loadIndex()

> **loadIndex**(`manifestUrl`, `vectorsUrl`): `Promise`&lt;`void`&gt;

#### Parameters

##### manifestUrl

`string`

##### vectorsUrl

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### search()

> **search**(`query`, `limit?`): `Promise`&lt;[`SearchResult`](../interfaces/SearchResult.md)[]&gt;

#### Parameters

##### query

`string`

##### limit?

`number` = `10`

#### Returns

`Promise`&lt;[`SearchResult`](../interfaces/SearchResult.md)[]&gt;
