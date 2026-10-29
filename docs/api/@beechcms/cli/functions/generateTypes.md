[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / generateTypes

# Function: generateTypes()

> **generateTypes**(`args?`): `Promise`&lt;`void`&gt;

Emits `SeedRegistryTypes` plus the schema fingerprint from LIVE D1 state.

Both artifacts derive from `introspectSeedDefinitions`, never from `beech.schema.ts`: a manifest
file may legitimately be ahead of or behind what is deployed, and types that are ahead of the
database are exactly the silent shape mismatch this chain exists to eliminate (feature brief,
business rule 1).

## Parameters

### args?

[`GenerateTypesOptions`](../interfaces/GenerateTypesOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
