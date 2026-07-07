[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IIdGenerator

# Interface: IIdGenerator

Identifier abstraction. Hides direct calls to crypto.randomUUID
so callers can swap in deterministic generators during tests for stable
snapshot assertions and predictable insert ordering.

## Methods

### isValid()

> **isValid**(`value`): `value is string`

Returns true when `value` has the exact shape produced by `uuid()`.
The ONLY place in the codebase that knows the id format. Never inline
a regex; always go through this method when validating a relation id,
a route param, or any user-supplied id.

#### Parameters

##### value

`unknown`

#### Returns

`value is string`

***

### uuid()

> **uuid**(): `string`

Generates a new universally unique identifier.
Production implementation delegates to crypto.randomUUID().
Test implementations return deterministic values for snapshot assertions.

#### Returns

`string`
