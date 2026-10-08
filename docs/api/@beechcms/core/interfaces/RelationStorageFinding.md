[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / RelationStorageFinding

# Interface: RelationStorageFinding

## Properties

### actual

> **actual**: `string`

What the database holds.

***

### alias

> **alias**: `string`

***

### expected

> **expected**: `string`

What the deployed definition requires, e.g. `junction rel_posts_tags`.

***

### issue

> **issue**: [`RelationStorageIssue`](../type-aliases/RelationStorageIssue.md)

***

### seed

> **seed**: `string`

***

### strandedRows

> **strandedRows**: `number`

Rows or values sitting in storage the definition no longer points at. Always 0 for
`missing_storage` and the FK findings: those carry no stranded values by themselves.
