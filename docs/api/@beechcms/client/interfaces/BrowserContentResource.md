[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / BrowserContentResource

# Interface: BrowserContentResource&lt;TRow&gt;

Browser Client Content Resource: Strictly Read-Only (no create/update).

## Type Parameters

### TRow

`TRow`

## Methods

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
