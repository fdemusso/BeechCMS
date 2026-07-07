[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ISeedRegistry

# Interface: ISeedRegistry

## Methods

### all()

> **all**(): [`Seed`](Seed.md)[]

Returns all seeds as a flat array, preserving insertion order.
Decouples callers from the internal storage shape so the registry
implementation can change without touching every route handler.

#### Returns

[`Seed`](Seed.md)[]

***

### draftEnabled()

> **draftEnabled**(): [`Seed`](Seed.md)[]

Returns seeds that have the draft workflow enabled.
Eliminates the seeds.filter(s =\> s.allowDrafts) pattern.

#### Returns

[`Seed`](Seed.md)[]

***

### get()

> **get**(`slug`): [`Seed`](Seed.md) \| `null`

Returns the seed with the given slug, or null if not found.
Provides a single lookup point that can be overridden in tests
without rebuilding the full registry object.

#### Parameters

##### slug

`string`

#### Returns

[`Seed`](Seed.md) \| `null`

***

### publicReadable()

> **publicReadable**(): [`Seed`](Seed.md)[]

Returns seeds that have allowPublicRead enabled.
Eliminates the seeds.filter(s =\> s.allowPublicRead) pattern.

#### Returns

[`Seed`](Seed.md)[]

***

### visibleInDashboard()

> **visibleInDashboard**(): [`Seed`](Seed.md)[]

Returns seeds that are visible in the dashboard sidebar.
A seed is visible when dashboard.hidden is not explicitly true.
Eliminates the seeds.filter(s =\> !s.dashboard?.hidden) pattern
that would otherwise be duplicated across route handlers.

#### Returns

[`Seed`](Seed.md)[]
