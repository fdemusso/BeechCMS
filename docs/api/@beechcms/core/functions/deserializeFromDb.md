[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / deserializeFromDb

# Function: deserializeFromDb()

> **deserializeFromDb**(`branch`, `value`): `unknown`

Deserializes a value read from the DB to its API/JS representation.
0/1 → boolean | Unix timestamp → ISO 8601 | JSON string → object/array

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

The branch definition.

### value

`unknown`

The raw database value.

## Returns

`unknown`

The deserialized value.
