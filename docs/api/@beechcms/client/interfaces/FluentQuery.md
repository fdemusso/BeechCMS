[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / FluentQuery

# Interface: FluentQuery&lt;TRow&gt;

## Type Parameters

### TRow

`TRow`

## Methods

### first()

> **first**(`options?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### options?

[`RequestOptions`](RequestOptions.md)

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Single`](../type-aliases/Single.md)&lt;`TRow`&gt;&gt;&gt;

***

### include()

> **include**(`relations`): `this`

#### Parameters

##### relations

`string`[]

#### Returns

`this`

***

### limit()

> **limit**(`count`): `this`

Page size. The serializer caps it at the Public API maximum of 100.

#### Parameters

##### count

`number`

#### Returns

`this`

***

### list()

> **list**(`options?`): `Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Listable`](../type-aliases/Listable.md)&lt;`TRow`&gt;&gt;&gt;

#### Parameters

##### options?

[`RequestOptions`](RequestOptions.md) & `object`

#### Returns

`Promise`&lt;[`BeechResult`](../type-aliases/BeechResult.md)&lt;[`Listable`](../type-aliases/Listable.md)&lt;`TRow`&gt;&gt;&gt;

***

### logic()

> **logic**(`operator`): `this`

Combines every `where()`/`whereRelation()` condition with AND (default) or OR.

#### Parameters

##### operator

`"AND"` \| `"OR"`

#### Returns

`this`

***

### orderBy()

> **orderBy**(`field`, `direction?`): `this`

Sorts on one column. The Public API honours a single sort key; a later call replaces the earlier one.

#### Parameters

##### field

`Extract`&lt;keyof `TRow`, `string`&gt;

##### direction?

`"asc"` \| `"desc"`

#### Returns

`this`

***

### page()

> **page**(`number`): `this`

1-based page number.

#### Parameters

##### number

`number`

#### Returns

`this`

***

### search()

> **search**(`term`): `this`

Full-text keyword search across the seed's searchable branches.

#### Parameters

##### term

`string`

#### Returns

`this`

***

### select()

> **select**(`fields`): `this`

#### Parameters

##### fields

`Extract`&lt;keyof `TRow`, `string`&gt;[]

#### Returns

`this`

***

### where()

> **where**(`filter`): `this`

#### Parameters

##### filter

`Record`&lt;`string`, [`FieldFilter`](../type-aliases/FieldFilter.md)&gt;

#### Returns

`this`

***

### whereRelation()

> **whereRelation**(`alias`, `subquery`): `this`

Filters the collection through a declared relation: keeps entries whose `alias` relation
points at any entry of the target seed matching `subquery`. Depth 1; the server refuses a
relation that `?include=` could not traverse, and refuses an over-broad subquery with 400.

#### Parameters

##### alias

`Extract`&lt;keyof `TRow`, `string`&gt;

##### subquery

[`RelationSubquery`](RelationSubquery.md)

#### Returns

`this`
