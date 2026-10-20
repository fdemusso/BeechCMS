[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / viewConfigChoiceIssues

# Function: viewConfigChoiceIssues()

> **viewConfigChoiceIssues**(`config`, `seed`): `string`[]

Brief §2.10: `sort`, `groupBy` and `kanban.sort` may reference a `tags` branch only when it is single choice;
`kanban.axisBranchId` may reference a `tags` branch only when it is a kanban axis candidate.
One message per offending reference, in the order sort, groupBy, kanban axis, kanban sort; `[]` when valid.
References to missing branches and to non-`tags` branches are not issues (cleanup handles them). Pure.

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

## Returns

`string`[]
