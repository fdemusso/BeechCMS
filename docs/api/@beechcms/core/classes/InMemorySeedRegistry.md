[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / InMemorySeedRegistry

# Class: InMemorySeedRegistry

Named subclass of SeedRegistry for use in test suites.
Gives tests a semantic name without requiring any dependency on factory.ts.

## Extends

- [`SeedRegistry`](SeedRegistry.md)

## Constructors

### Constructor

> **new InMemorySeedRegistry**(`seeds`): `InMemorySeedRegistry`

#### Parameters

##### seeds

[`Seed`](../interfaces/Seed.md)[]

#### Returns

`InMemorySeedRegistry`

#### Inherited from

[`SeedRegistry`](SeedRegistry.md).[`constructor`](SeedRegistry.md#constructor)

## Methods

### all()

> **all**(): [`Seed`](../interfaces/Seed.md)[]

Returns all seeds as a flat array, preserving insertion order.
Decouples callers from the internal storage shape so the registry
implementation can change without touching every route handler.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Inherited from

[`SeedRegistry`](SeedRegistry.md).[`all`](SeedRegistry.md#all)

***

### draftEnabled()

> **draftEnabled**(): [`Seed`](../interfaces/Seed.md)[]

Returns seeds that have the draft workflow enabled.
Eliminates the seeds.filter(s =\> s.allowDrafts) pattern.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Inherited from

[`SeedRegistry`](SeedRegistry.md).[`draftEnabled`](SeedRegistry.md#draftenabled)

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

#### Inherited from

[`SeedRegistry`](SeedRegistry.md).[`get`](SeedRegistry.md#get)

***

### publicReadable()

> **publicReadable**(): [`Seed`](../interfaces/Seed.md)[]

Returns seeds that have allowPublicRead enabled.
Eliminates the seeds.filter(s =\> s.allowPublicRead) pattern.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Inherited from

[`SeedRegistry`](SeedRegistry.md).[`publicReadable`](SeedRegistry.md#publicreadable)

***

### visibleInDashboard()

> **visibleInDashboard**(): [`Seed`](../interfaces/Seed.md)[]

Returns seeds that are visible in the dashboard sidebar.
A seed is visible when dashboard.hidden is not explicitly true.
Eliminates the seeds.filter(s =\> !s.dashboard?.hidden) pattern
that would otherwise be duplicated across route handlers.

#### Returns

[`Seed`](../interfaces/Seed.md)[]

#### Inherited from

[`SeedRegistry`](SeedRegistry.md).[`visibleInDashboard`](SeedRegistry.md#visibleindashboard)
