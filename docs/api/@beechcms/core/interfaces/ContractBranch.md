[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ContractBranch

# Interface: ContractBranch

The response-shape-bearing subset of a `Branch`.

## Properties

### alias

> **alias**: `string`

***

### fields?

> `optional` **fields?**: `ContractBranch`[]

Repeater sub-fields, same projection, recursively.

***

### format?

> `optional` **format?**: `"date"` \| `"plain"` \| `"markdown"` \| `"html"` \| `"datetime"` \| `"asset-list"`

***

### maxItems?

> `optional` **maxItems?**: `number`

***

### minItems?

> `optional` **minItems?**: `number`

***

### multiple?

> `optional` **multiple?**: `boolean`

***

### options?

> `optional` **options?**: `string`[]

***

### publicEdit

> **publicEdit**: `boolean`

***

### publicRead

> **publicRead**: `boolean`

***

### requiredOnCreate

> **requiredOnCreate**: `boolean`

***

### requiredOnUpdate

> **requiredOnUpdate**: `boolean`

***

### targetSeed?

> `optional` **targetSeed?**: `string`

***

### type

> **type**: [`BranchType`](../type-aliases/BranchType.md)

***

### visibility

> **visibility**: `"full"` \| `"masked"` \| `"hidden"`

From `resolvePolicies`, so an explicitly-written default hashes like an omitted one.
