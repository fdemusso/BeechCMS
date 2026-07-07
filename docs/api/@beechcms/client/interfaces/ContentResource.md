[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/client](../README.md) / ContentResource

# Interface: ContentResource&lt;TRow&gt;

## Type Parameters

### TRow

`TRow`

## Methods

### create()

> **create**(`input`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Single`&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### input

`Partial`&lt;`TRow`&gt;

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Single`&lt;`TRow`&gt;&gt;&gt;

***

### get()

> **get**(`selector`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Single`&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### selector

\{ `id`: `string`; \} \| \{ `slug`: `string`; \}

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Single`&lt;`TRow`&gt;&gt;&gt;

***

### list()

> **list**(`query?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Listable`&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### query?

[`ListQuery`](ListQuery.md)&lt;`TRow`&gt;

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Listable`&lt;`TRow`&gt;&gt;&gt;

***

### update()

> **update**(`id`, `input`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Single`&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### id

`string`

##### input

`Partial`&lt;`TRow`&gt;

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;`Single`&lt;`TRow`&gt;&gt;&gt;
