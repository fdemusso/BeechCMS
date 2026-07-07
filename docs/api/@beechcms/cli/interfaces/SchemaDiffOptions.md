[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/cli](../README.md) / SchemaDiffOptions

# Interface: SchemaDiffOptions

## Properties

### db?

> `optional` **db?**: `string`

Override D1 database name.

***

### local

> **local**: `boolean`

Compare against remote D1 (default: local).

***

### migrationsDir?

> `optional` **migrationsDir?**: `string`

Override migrations dir (default: \<cwd\>/apps/api/migrations).

***

### name?

> `optional` **name?**: `string`

Optional migration name (used in the filename).

***

### registry?

> `optional` **registry?**: `Record`&lt;`string`, [`Seed`](../../core/interfaces/Seed.md)&gt; \| `null`

***

### write

> **write**: `boolean`

When set, write an additive migration file instead of just printing.
