[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/client](../README.md) / ListQuery

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

### search?

> `optional` **search?**: `string`

***

### sort?

> `optional` **sort?**: `Partial`&lt;`Record`&lt;keyof `TRow` & `string`, `"asc"` \| `"desc"`&gt;&gt;
