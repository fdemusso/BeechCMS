[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / DashboardSeedConfig

# Interface: DashboardSeedConfig

Dashboard-specific config embedded in a Seed. All fields optional — defaults applied by the dashboard.

## Properties

### description?

> `optional` **description?**: `string`

Tooltip description shown in the sidebar.

***

### features?

> `optional` **features?**: `object`

UI feature toggles. All default to true unless specified.

#### bulkDelete?

> `optional` **bulkDelete?**: `boolean`

#### export?

> `optional` **export?**: `boolean`

#### filter?

> `optional` **filter?**: `boolean`

#### search?

> `optional` **search?**: `boolean`

***

### group?

> `optional` **group?**: `string`

Sidebar group label. Ungrouped seeds share a single 'Contents' section.

***

### hidden?

> `optional` **hidden?**: `boolean`

Hide from sidebar navigation. Default: false.

***

### icon?

> `optional` **icon?**: `string`

Lucide icon name (string, resolved to component client-side). Default: 'Folder'.

***

### order?

> `optional` **order?**: `number`

Sort order within the group. Lower = higher. Default: 99.

***

### views?

> `optional` **views?**: [`DashboardView`](../type-aliases/DashboardView.md)[]

Views authorized for this seed in the content manager. When omitted,
the dashboard falls back to DEFAULT_AUTHORIZED_VIEWS. 'table' is always
guaranteed at read time by resolveAuthorizedViews (universal fallback).
