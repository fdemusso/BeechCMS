[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / WidgetRoute

# Interface: WidgetRoute&lt;Query, Response&gt;

One widget route as the typed `hc` client exposes it: `client.<route>[':seed'].$get(...)`.

## Type Parameters

### Query

`Query`

### Response

`Response`

## Methods

### $get()

> **$get**(`args`): `Promise`&lt;\{ `json`(): `Promise`&lt;`Response`&gt;; \}&gt;

#### Parameters

##### args

###### param

\{ `seed`: `string`; \}

###### param.seed

`string`

###### query

`Query`

#### Returns

`Promise`&lt;\{ `json`(): `Promise`&lt;`Response`&gt;; \}&gt;
