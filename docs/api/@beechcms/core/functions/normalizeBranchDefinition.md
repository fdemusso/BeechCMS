[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / normalizeBranchDefinition

# Function: normalizeBranchDefinition()

> **normalizeBranchDefinition**(`branch`): `Record`&lt;`string`, `unknown`&gt;

Comparable form of one branch definition. Two branches are the same definition iff their canonicalStringify bytes match.

- `id` is dropped, recursively through `fields`.
- `requiredOnCreate` / `requiredOnUpdate` omitted ≡ `false`.
- `multiple` omitted ≡ `true` on `tags` (single source of truth: `isSingleChoiceTags`), ≡ `false` on every other type.
- Every other key, unknown ones included, is copied unchanged: `options` is compared as declared (values, colors, order).

## Parameters

### branch

[`BranchDefinitionLike`](../type-aliases/BranchDefinitionLike.md)

## Returns

`Record`&lt;`string`, `unknown`&gt;
