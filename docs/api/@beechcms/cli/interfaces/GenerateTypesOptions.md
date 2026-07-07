[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/cli](../README.md) / GenerateTypesOptions

# Interface: GenerateTypesOptions

## Properties

### db?

> `optional` **db?**: `string`

Override D1 database name (remote path only).

***

### local

> **local**: `boolean`

Read from in-code SEED_REGISTRY (true) instead of introspecting D1 (false).

***

### out

> **out**: `string`

Output path for the generated .ts file.

***

### registry?

> `optional` **registry?**: `Record`&lt;`string`, [`Seed`](../../core/interfaces/Seed.md)&gt; \| `null`

Pre-resolved registry (injected by bin/ for --local, and by tests).
