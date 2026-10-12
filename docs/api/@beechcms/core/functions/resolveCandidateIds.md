[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveCandidateIds

# Function: resolveCandidateIds()

> **resolveCandidateIds**&lt;`T`&gt;(`candidate`, `stored`): `T`

Fills the id of every branch (and repeater sub-field) that lacks one.

The stored id wins by alias match; only an alias the stored definition does not know gets a fresh
`nextBranchId`. An id already present on the candidate is kept as-is: callers that author without
ids (hand-written manifests) must send none rather than invented ones.

## Type Parameters

### T

`T` *extends* `object`

## Parameters

### candidate

`T`

### stored

[`Seed`](../interfaces/Seed.md) \| `null`

## Returns

`T`
