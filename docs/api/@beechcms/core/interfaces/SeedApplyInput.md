[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SeedApplyInput

# Interface: SeedApplyInput

Input for an atomic, OCC-guarded schema apply.

## Properties

### ddl

> **ddl**: `string`[]

Additive DDL produced by planCreateSeed / planExtendSeed. Never destructive.

***

### definition

> **definition**: [`Seed`](Seed.md)

Full canonical definition to store in `seeds.definition`.

***

### expectedVersion

> **expectedVersion**: `number`

The registry_version the caller planned against (compare-and-swap guard).

***

### slug

> **slug**: `string`

***

### source?

> `optional` **source?**: `"code"` \| `"runtime"`
