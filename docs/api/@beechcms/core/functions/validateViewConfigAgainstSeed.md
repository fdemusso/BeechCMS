[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / validateViewConfigAgainstSeed

# Function: validateViewConfigAgainstSeed()

> **validateViewConfigAgainstSeed**(`config`, `seed`, `type`): `object`

Pure auto-cleanup, never an error: drops references to branches the seed no longer has,
duplicate filters on one column, date precision on a non-date grouping, and the Kanban
sub-config on a non-kanban instance and the card layout on a table instance. Same policy as validateCardConfigAgainstSeed.

## Parameters

### config

#### appearance

\{ `columnOrder?`: `string`[]; `density?`: `"compact"` \| `"normal"` \| `"comfortable"`; `hiddenColumns?`: `string`[]; `pageSize?`: `number`; \} = `...`

#### appearance.columnOrder?

`string`[] = `...`

Display order of data columns; columns missing from the list follow in default order.

#### appearance.density?

`"compact"` \| `"normal"` \| `"comfortable"` = `...`

#### appearance.hiddenColumns?

`string`[] = `...`

#### appearance.pageSize?

`number` = `...`

#### card?

\{ `header?`: \{ `branchId`: `string`; \} \| `null`; `media?`: \{ `branchId`: `string`; \} \| `null`; `metadata`: `object`[]; `subtitle?`: \{ `branchId`: `string`; \} \| `null`; `version`: `1`; \} = `...`

Card layout (Kanban and Gallery). Dropped from any other instance.

#### card.header?

\{ `branchId`: `string`; \} \| `null` = `...`

Full-width primary line. Max 1.

#### card.media?

\{ `branchId`: `string`; \} \| `null` = `...`

Optional media/avatar slot. Full width. Max 1.

#### card.metadata

`object`[] = `...`

2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP).

#### card.subtitle?

\{ `branchId`: `string`; \} \| `null` = `...`

Full-width secondary line. Max 1.

#### card.version

`1` = `...`

#### conditionalFormats

`object`[] = `...`

#### filters

`object`[] = `...`

#### folders?

`Record`&lt;`string`, \{ `color?`: `"slate"` \| `"red"` \| `"orange"` \| `"amber"` \| `"green"` \| `"teal"` \| `"blue"` \| `"violet"` \| `"pink"`; `description?`: `string`; `icon?`: `"Folder"` \| `"Star"` \| `"Heart"` \| `"Image"` \| `"Camera"` \| `"Calendar"` \| `"Tag"` \| `"Bookmark"` \| `"Home"` \| `"Gift"` \| `"Video"` \| `"Music"` \| `"Book"` \| `"Flag"` \| `"Briefcase"` \| `"Users"` \| `"Sun"` \| `"Crown"`; `label?`: `string`; \}&gt; = `...`

Gallery-only. Style per folder, keyed by the normalized group value. Dropped from any other instance.

#### groupBy

\{ `columnRef`: `string`; `datePrecision?`: \{ `day`: `boolean`; `month`: `boolean`; `year`: `boolean`; \}; \} \| `null` = `...`

#### kanban?

\{ `axisBranchId`: `string` \| `null`; `collapsedColumnValues?`: `string`[]; `hiddenColumnValues?`: `string`[]; `sort`: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`; \} = `...`

Kanban-only. Dropped from any non-kanban instance.

#### kanban.axisBranchId

`string` \| `null` = `...`

#### kanban.collapsedColumnValues?

`string`[] = `...`

#### kanban.hiddenColumnValues?

`string`[] = `...`

#### kanban.sort

\{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null` = `...`

#### sort

\{ `columnRef`: `string`; `desc`: `boolean`; \} \| `null` = `...`

### seed

[`Seed`](../interfaces/Seed.md)

### type

[`DashboardView`](../type-aliases/DashboardView.md)

## Returns

### appearance

> **appearance**: `object`

#### appearance.columnOrder?

> `optional` **columnOrder?**: `string`[]

Display order of data columns; columns missing from the list follow in default order.

#### appearance.density?

> `optional` **density?**: `"compact"` \| `"normal"` \| `"comfortable"`

#### appearance.hiddenColumns?

> `optional` **hiddenColumns?**: `string`[]

#### appearance.pageSize?

> `optional` **pageSize?**: `number`

### card?

> `optional` **card?**: `object`

Card layout (Kanban and Gallery). Dropped from any other instance.

#### card.header?

> `optional` **header?**: \{ `branchId`: `string`; \} \| `null`

Full-width primary line. Max 1.

#### card.media?

> `optional` **media?**: \{ `branchId`: `string`; \} \| `null`

Optional media/avatar slot. Full width. Max 1.

#### card.metadata

> **metadata**: `object`[]

2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP).

#### card.subtitle?

> `optional` **subtitle?**: \{ `branchId`: `string`; \} \| `null`

Full-width secondary line. Max 1.

#### card.version

> **version**: `1`

### conditionalFormats

> **conditionalFormats**: `object`[]

### filters

> **filters**: `object`[]

### folders?

> `optional` **folders?**: `Record`&lt;`string`, \{ `color?`: `"slate"` \| `"red"` \| `"orange"` \| `"amber"` \| `"green"` \| `"teal"` \| `"blue"` \| `"violet"` \| `"pink"`; `description?`: `string`; `icon?`: `"Folder"` \| `"Star"` \| `"Heart"` \| `"Image"` \| `"Camera"` \| `"Calendar"` \| `"Tag"` \| `"Bookmark"` \| `"Home"` \| `"Gift"` \| `"Video"` \| `"Music"` \| `"Book"` \| `"Flag"` \| `"Briefcase"` \| `"Users"` \| `"Sun"` \| `"Crown"`; `label?`: `string`; \}&gt;

Gallery-only. Style per folder, keyed by the normalized group value. Dropped from any other instance.

### groupBy

> **groupBy**: \{ `columnRef`: `string`; `datePrecision?`: \{ `day`: `boolean`; `month`: `boolean`; `year`: `boolean`; \}; \} \| `null`

#### Union Members

##### Type Literal

\{ `columnRef`: `string`; `datePrecision?`: \{ `day`: `boolean`; `month`: `boolean`; `year`: `boolean`; \}; \}

##### columnRef

> **columnRef**: `string` = `viewColumnRefSchema`

##### datePrecision?

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

### kanban?

> `optional` **kanban?**: `object`

Kanban-only. Dropped from any non-kanban instance.

#### kanban.axisBranchId

> **axisBranchId**: `string` \| `null`

#### kanban.collapsedColumnValues?

> `optional` **collapsedColumnValues?**: `string`[]

#### kanban.hiddenColumnValues?

> `optional` **hiddenColumnValues?**: `string`[]

#### kanban.sort

> **sort**: \{ `branchId`: `string`; `dir`: `"ASC"` \| `"DESC"`; \} \| `null`

### sort

> **sort**: \{ `columnRef`: `string`; `desc`: `boolean`; \} \| `null`
