[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / SeedRegistry

# Class: SeedRegistry

## Extended by

- [`InMemorySeedRegistry`](InMemorySeedRegistry.md)

## Implements

- [`ISeedRegistry`](../interfaces/ISeedRegistry.md)

## Constructors

### Constructor

> **new SeedRegistry**(`seeds`): `SeedRegistry`

#### Parameters

##### seeds

[`Seed`](../interfaces/Seed.md)[]

#### Returns

`SeedRegistry`

## Methods

### all()

> **all**(): [`Seed`](../interfaces/Seed.md)[]

Returns all seeds as a flat array, preserving insertion order.
Decouples callers from the internal storage shape so the registry
implementation can change without touching every route handler.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Implementation of

[`ISeedRegistry`](../interfaces/ISeedRegistry.md).[`all`](../interfaces/ISeedRegistry.md#all)

***

### draftEnabled()

> **draftEnabled**(): [`Seed`](../interfaces/Seed.md)[]

Returns seeds that have the draft workflow enabled.
Eliminates the seeds.filter(s =\> s.allowDrafts) pattern.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Implementation of

[`ISeedRegistry`](../interfaces/ISeedRegistry.md).[`draftEnabled`](../interfaces/ISeedRegistry.md#draftenabled)

***

### get()

> **get**(`slug`): [`Seed`](../interfaces/Seed.md) \| `null`

Returns the seed with the given slug, or null if not found.
Provides a single lookup point that can be overridden in tests
without rebuilding the full registry object.

#### Parameters

##### slug

`string`

#### Returns

[`Seed`](../interfaces/Seed.md) \| `null`

#### Implementation of

[`ISeedRegistry`](../interfaces/ISeedRegistry.md).[`get`](../interfaces/ISeedRegistry.md#get)

***

### publicReadable()

> **publicReadable**(): [`Seed`](../interfaces/Seed.md)[]

Returns seeds that have allowPublicRead enabled.
Eliminates the seeds.filter(s =\> s.allowPublicRead) pattern.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Implementation of

[`ISeedRegistry`](../interfaces/ISeedRegistry.md).[`publicReadable`](../interfaces/ISeedRegistry.md#publicreadable)

***

### visibleInDashboard()

> **visibleInDashboard**(): [`Seed`](../interfaces/Seed.md)[]

Returns seeds that are visible in the dashboard sidebar.
A seed is visible when dashboard.hidden is not explicitly true.
Eliminates the seeds.filter(s =\> !s.dashboard?.hidden) pattern
that would otherwise be duplicated across route handlers.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Implementation of

[`ISeedRegistry`](../interfaces/ISeedRegistry.md).[`visibleInDashboard`](../interfaces/ISeedRegistry.md#visibleindashboard)
