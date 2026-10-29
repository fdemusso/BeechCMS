[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / planCreateSeed

# Function: planCreateSeed()

> **planCreateSeed**(`seed`): `string`[]

Full create-from-scratch statement set for a seed. Mirrors the CLI's buildStatements.
Order: parent table → indexes → draft table → FTS table → FTS triggers →
per multi-relation: junction table → junction indexes → junction draft table.
Callers that create several seeds must order seeds with sortSeedsByDependencies
first so relation FK targets exist.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

`string`[]
