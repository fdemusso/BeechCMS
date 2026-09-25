[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isLocalizedBranch

# Function: isLocalizedBranch()

> **isLocalizedBranch**(`branch`): `boolean`

True when the branch is localized AND its type supports it. A malformed definition that slipped past
seed validation (e.g. `localized: true` on a `number`) is treated as not localized, never as a dictionary.

## Parameters

### branch

`Pick`&lt;[`Branch`](../interfaces/Branch.md), `"type"` \| `"localized"`&gt;

## Returns

`boolean`
