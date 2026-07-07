[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / WidgetSdkClient

# Interface: WidgetSdkClient

Minimal HTTP client contract the SDK's data hooks depend on. The
dashboard's Axios instance satisfies this shape — no Axios import lives
in this package.

## Methods

### get()

> **get**&lt;`T`&gt;(`url`, `config?`): `Promise`&lt;\{ `data`: `T`; \}&gt;

#### Type Parameters

##### T

`T`

#### Parameters

##### url

`string`

##### config?

###### params?

`Record`&lt;`string`, `unknown`&gt;

#### Returns

`Promise`&lt;\{ `data`: `T`; \}&gt;
