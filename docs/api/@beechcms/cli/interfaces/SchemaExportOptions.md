[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / SchemaExportOptions

# Interface: SchemaExportOptions

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

Destination path. `null` writes to standard output. Default: `beech.schema.ts`.
