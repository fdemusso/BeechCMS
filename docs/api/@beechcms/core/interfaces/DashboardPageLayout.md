[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DashboardPageLayout

# Interface: DashboardPageLayout

## Properties

### icon?

> `optional` **icon?**: `string`

Lucide icon name, same convention as DashboardSeedConfig.icon.

***

### id

> **id**: `string`

***

### label

> **label**: `string`

***

### roles?

> `optional` **roles?**: `string`[]

Ids (not names) of the roles this tab targets. Absent or empty = every caller.
 Non-empty = callers holding at least one of them through an active assignment, at any scope.

***

### sections

> **sections**: [`DashboardSection`](DashboardSection.md)[]

***

### slug

> **slug**: `string`

URL identity (?page=\<slug\>). Unique within the layout.
