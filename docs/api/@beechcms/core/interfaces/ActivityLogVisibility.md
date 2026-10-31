[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ActivityLogVisibility

# Interface: ActivityLogVisibility

Which activity rows a caller may see, keyed on the seed each row is tied to.
Omitted from an options object = no restriction (the self-service per-user feed).

## Properties

### includeUnscoped

> `readonly` **includeUnscoped**: `boolean`

Whether rows with `entitySlug === null` (media uploads, schema events, security alerts) are visible.

***

### seeds

> `readonly` **seeds**: readonly `string`[] \| `"all"`

`'all'`: every row that carries a seed slug.
A list: only rows whose `entitySlug` is in it. An empty list matches no slugged row.
