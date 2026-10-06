[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ContentViewRecord

# Interface: ContentViewRecord

Storage shape: `type` is unchecked text until projectContentView narrows it.

## Extends

- `Omit`&lt;[`ContentView`](ContentView.md), `"type"`&gt;

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

Card layout (Kanban and Gallery). Dropped from any other instance.

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

#### Inherited from

[`ContentView`](ContentView.md).[`config`](ContentView.md#config)

***

### createdAt

> **createdAt**: `number`

#### Inherited from

[`ContentView`](ContentView.md).[`createdAt`](ContentView.md#createdat)

***

### id

> **id**: `string`

#### Inherited from

[`ContentView`](ContentView.md).[`id`](ContentView.md#id)

***

### position

> **position**: `number`

#### Inherited from

[`ContentView`](ContentView.md).[`position`](ContentView.md#position)

***

### seedSlug

> **seedSlug**: `string`

#### Inherited from

[`ContentView`](ContentView.md).[`seedSlug`](ContentView.md#seedslug)

***

### title

> **title**: `string` \| `null`

null → the client renders the translated label of `type`.

#### Inherited from

[`ContentView`](ContentView.md).[`title`](ContentView.md#title)

***

### type

> **type**: `string`

***

### updatedAt

> **updatedAt**: `number`

#### Inherited from

[`ContentView`](ContentView.md).[`updatedAt`](ContentView.md#updatedat)

***

### updatedBy

> **updatedBy**: `string`

#### Inherited from

[`ContentView`](ContentView.md).[`updatedBy`](ContentView.md#updatedby)
