[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / ServerContentResource

# Interface: ServerContentResource&lt;TRow&gt;

Server Client Content Resource: Content mutation and query operations (create, update, list, get).

## Type Parameters

### TRow

`TRow`

## Methods

### create()

> **create**(`input`, `options?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### input

`Partial`&lt;`TRow`&gt;

##### options?

[`RequestOptions`](RequestOptions.md)

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

***

### get()

> **get**(`selector`, `options?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### selector

\{ `id`: `string`; \} \| \{ `slug`: `string`; \}

##### options?

[`RequestOptions`](RequestOptions.md)

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

***

### list()

> **list**(`query?`, `options?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Listable`](../type-aliases/Listable.md)&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### query?

[`ListQuery`](ListQuery.md)&lt;`TRow`&gt;

##### options?

[`RequestOptions`](RequestOptions.md)

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Listable`](../type-aliases/Listable.md)&lt;`TRow`&gt;&gt;&gt;

***

### update()

> **update**(`id`, `input`, `options?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### id

`string`

##### input

`Partial`&lt;`TRow`&gt;

##### options?

[`RequestOptions`](RequestOptions.md)

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;
