[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / GenerateTypesOptions

# Interface: GenerateTypesOptions

## Properties

### db?

> `optional` **db?**: `string`

Override the D1 database name.

***

### local?

> `optional` **local?**: `boolean`

Target local D1 SQLite state (default: true). Set false for remote D1.

***

### out?

> `optional` **out?**: `string` \| `null`

Output destination. `null` writes to standard output. Default: `beech.generated.ts`.
