[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ContentView

# Interface: ContentView

The API shape. Timestamps are unix seconds, like every other system table.

## Properties

### config

> **config**: `object`

#### appearance

> **appearance**: `object`

##### appearance.density?

> `optional` **density?**: `"compact"` \| `"normal"` \| `"comfortable"`

##### appearance.hiddenColumns?

> `optional` **hiddenColumns?**: `string`[]

##### appearance.pageSize?

> `optional` **pageSize?**: `number`

#### card?

> `optional` **card?**: `object`

Kanban-only card layout. Dropped from any non-kanban instance.

##### card.header?

> `optional` **header?**: \{ `branchId`: `string`; \} \| `null`

Full-width primary line. Max 1.

##### card.media?

> `optional` **media?**: \{ `branchId`: `string`; \} \| `null`

Optional media/avatar slot. Full width. Max 1.

##### card.metadata

> **metadata**: `object`[]

2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP).

##### card.subtitle?

> `optional` **subtitle?**: \{ `branchId`: `string`; \} \| `null`

Full-width secondary line. Max 1.

##### card.version

> **version**: `1`

#### conditionalFormats

> **conditionalFormats**: `object`[]

#### filters

> **filters**: `object`[]

#### groupBy

> **groupBy**: \{ `columnRef`: `string`; `datePrecision?`: \{ `day`: `boolean`; `month`: `boolean`; `year`: `boolean`; \}; \} \| `null`

##### Union Members

###### Type Literal

\{ `columnRef`: `string`; `datePrecision?`: \{ `day`: `boolean`; `month`: `boolean`; `year`: `boolean`; \}; \}

###### columnRef

> **columnRef**: `string` = `viewColumnRefSchema`

###### datePrecision?

> `optional` **datePrecision?**: `object`

Only meaningful on a date column; stripped otherwise by validateViewConfigAgainstSeed.

###### datePrecision.day

> **day**: `boolean`

###### datePrecision.month

> **month**: `boolean`

###### datePrecision.year

> **year**: `boolean`

***

`null`

#### kanban?

> `optional` **kanban?**: `object`

Kanban-only. Dropped from any non-kanban instance.

##### kanban.axisBranchId

> **axisBranchId**: `string` \| `null`

##### kanban.collapsedColumnValues?

> `optional` **collapsedColumnValues?**: `string`[]

##### kanban.hiddenColumnValues?

> `optional` **hiddenColumnValues?**: `string`[]

##### kanban.sort

> **sort**: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`

#### sort

> **sort**: \{ `columnRef`: `string`; `desc`: `boolean`; \} \| `null`

***

### createdAt

> **createdAt**: `number`

***

### id

> **id**: `string`

***

### position

> **position**: `number`

***

### seedSlug

> **seedSlug**: `string`

***

### title

> **title**: `string` \| `null`

null → the client renders the translated label of `type`.

***

### type

> **type**: [`DashboardView`](../type-aliases/DashboardView.md)

***

### updatedAt

> **updatedAt**: `number`

***

### updatedBy

> **updatedBy**: `string`
