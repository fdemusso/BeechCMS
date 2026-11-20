[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ActivityLogListOptions

# Interface: ActivityLogListOptions

## Properties

### entitySlug?

> `optional` **entitySlug?**: `string`

Restrict the result to a specific content seed. Used by per-seed feeds.

***

### entityTypes?

> `optional` **entityTypes?**: readonly [`EntityType`](../type-aliases/EntityType.md)[]

Restrict the result to these entity types. A feed shown to people other than the actor (the dashboard
widget) must name the types it may show: sign-ins, password changes and the like are the actor's own.

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
