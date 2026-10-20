[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / createTolerantSeedRegistry

# Function: createTolerantSeedRegistry()

> **createTolerantSeedRegistry**(`seeds`): `object`

Builds a registry from every seed that validates and sets aside the ones that do not.

`new SeedRegistry(seeds)` is all-or-nothing: one seed holding a legacy shape (say pre-0.9 tag
options) throws and takes the whole API down. Validation is per seed and independent, so this
validates each seed alone and leaves the failing ones out. Callers log `quarantined`; the rest of
the system keeps serving.

## Parameters

### seeds

readonly [`Seed`](../interfaces/Seed.md)[]

## Returns

`object`

### quarantined

> **quarantined**: [`QuarantinedSeed`](../interfaces/QuarantinedSeed.md)[]

### registry

> **registry**: [`SeedRegistry`](../classes/SeedRegistry.md)
