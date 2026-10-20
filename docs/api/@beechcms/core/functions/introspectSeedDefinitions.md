[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / introspectSeedDefinitions

# Function: introspectSeedDefinitions()

> **introspectSeedDefinitions**(`executor`): `Promise`&lt;[`Seed`](../interfaces/Seed.md)[]&gt;

The DECLARED schema: every active seed definition, read live from D1.

This — not `beech.schema.ts` — is the source of truth for generated types and for the schema
fingerprint (feature brief, business rule 1). The manifest file is a desired-state artifact and
may legitimately be ahead of, or behind, what is deployed.

## Parameters

### executor

[`SchemaQueryExecutor`](../interfaces/SchemaQueryExecutor.md)

## Returns

`Promise`&lt;[`Seed`](../interfaces/Seed.md)[]&gt;
