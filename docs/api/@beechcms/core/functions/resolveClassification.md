[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveClassification

# Function: resolveClassification()

> **resolveClassification**(`branch`): [`ResolvedClassification`](../interfaces/ResolvedClassification.md)

Resolves the 4-tier DataClassification for a branch, bundling its storage
strategy at rest and its API visibility rules (public vs auth context).

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

The seed branch definition to inspect.

## Returns

[`ResolvedClassification`](../interfaces/ResolvedClassification.md)

The resolved classification details and visibility rules.
