[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SelectOptions

# Interface: SelectOptions

## Properties

### fields?

> `optional` **fields?**: `string`[]

Column projection. Empty = SELECT *.

***

### filterLogic?

> `optional` **filterLogic?**: `"AND"` \| `"OR"`

How top-level `filters` groups are combined. Defaults to 'AND'.

***

### filters?

> `optional` **filters?**: [`FilterGroup`](FilterGroup.md)[]

Filter groups. Joined by `filterLogic` (default AND); conditions within a group are always ANDed.

***

### isCount?

> `optional` **isCount?**: `boolean`

When true, generates a COUNT(*) query instead of fetching rows.
This omits projections, sorting/ordering clauses, and pagination limits/offsets,
while keeping the join/where clauses intact for accurate counts.

***

### kanbanOrder?

> `optional` **kanbanOrder?**: `object`

When set, LEFT JOIN kanban_positions and order by fractional index (KB-S04c/S05).
 Mutually exclusive with `orderBy`; if both present, `kanbanOrder` wins.

#### axisBranchId

> **axisBranchId**: `string`

#### seedSlug

> **seedSlug**: `string`

***

### orderBy?

> `optional` **orderBy?**: `object`

Sort column and direction. Ignored when `kanbanOrder` is set.

#### column

> **column**: `string`

#### dir

> **dir**: `"ASC"` \| `"DESC"`

***

### pagination?

> `optional` **pagination?**: `object`

LIMIT/OFFSET pagination.

#### limit

> **limit**: `number`

#### offset

> **offset**: `number`

***

### search?

> `optional` **search?**: `string`

Full-text search — uses FTS5 if the seed has indexable richtext/text branches.

***

### status?

> `optional` **status?**: `string` \| `null`

Filters by status. null = no status filter.
