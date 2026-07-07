[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / serializeForDb

# Function: serializeForDb()

> **serializeForDb**(`branch`, `value`): `string` \| `number` \| `null`

Serializes a value for writing to the DB.
boolean → 0/1 | date → Unix timestamp | json/tags/richtext/repeater → JSON string

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

The branch definition.

### value

`unknown`

The value to serialize.

## Returns

`string` \| `number` \| `null`

The serialized DB value (string, number, or null).
