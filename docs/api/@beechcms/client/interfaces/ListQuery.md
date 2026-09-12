[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / ListQuery

# Interface: ListQuery&lt;TRow&gt;

## Type Parameters

### TRow

`TRow`

## Properties

### fields?

> `optional` **fields?**: keyof `TRow` & `string`[]

***

### filter?

> `optional` **filter?**: \{ \[K in string \| number \| symbol\]?: FieldFilter \} & `Record`&lt;`string`, [`FieldFilter`](../type-aliases/FieldFilter.md)&gt;

***

### include?

> `optional` **include?**: `string`[]

***

### latest?

> `optional` **latest?**: `number`

***

### limit?

> `optional` **limit?**: `number`

***

### logic?

> `optional` **logic?**: `"AND"` \| `"OR"`

***

### page?

> `optional` **page?**: `number`

***

### relationFilters?

> `optional` **relationFilters?**: `Record`&lt;`string`, [`RelationSubquery`](RelationSubquery.md)&gt;

Relation alias → subquery. Encoded into the `filter` parameter as a nested `in` value.

***

### search?

> `optional` **search?**: `string`

***

### sort?

> `optional` **sort?**: `Partial`&lt;`Record`&lt;keyof `TRow` & `string`, `"asc"` \| `"desc"`&gt;&gt;
