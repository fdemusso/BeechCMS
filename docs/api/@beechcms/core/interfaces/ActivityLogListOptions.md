[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ActivityLogListOptions

# Interface: ActivityLogListOptions

## Properties

### entitySlug?

> `optional` **entitySlug?**: `string`

Restrict the result to a specific content seed. Used by per-seed feeds.

***

### limit

> **limit**: `number`

Hard upper bound on the number of rows returned.

***

### userId?

> `optional` **userId?**: `string`

Restrict the result to a specific user. Used by the per-user activity tab.

***

### visibility?

> `optional` **visibility?**: [`ActivityLogVisibility`](ActivityLogVisibility.md)

Authorization filter applied in the query, before `limit`.
