[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / BackrefSource

# Interface: BackrefSource

## Properties

### branchAlias

> **branchAlias**: `string`

`branch.alias` — the FK column name (single) or join-table name suffix (multi)

***

### branchLabel

> **branchLabel**: `string`

`branch.label` — human label for UI grouping

***

### relationship

> **relationship**: `"single"` \| `"multi"`

'single' for direct FK, 'multi' for many-to-many join table

***

### restricts

> **restricts**: `boolean`

True when branch.onDelete === 'RESTRICT' — used to disable Delete button

***

### sourceSlug

> **sourceSlug**: `string`

Slug of the seed that owns the relation branch
