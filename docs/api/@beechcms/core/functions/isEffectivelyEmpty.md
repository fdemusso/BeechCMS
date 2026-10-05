[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isEffectivelyEmpty

# Function: isEffectivelyEmpty()

> **isEffectivelyEmpty**(`value`, `branchType?`): `boolean`

Checks if a value is effectively empty (e.g. null, undefined, empty string, empty array, or empty rich text).

Shared by top-level required-field detection (`index.ts`) and repeater item validation
(`schema-builders.ts`) so both tiers apply the same emptiness rule to required fields.

## Parameters

### value

`unknown`

The value to check.

### branchType?

`string`

The type of the branch being checked.

## Returns

`boolean`

True if effectively empty, false otherwise.
