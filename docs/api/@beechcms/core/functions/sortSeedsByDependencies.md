[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / sortSeedsByDependencies

# Function: sortSeedsByDependencies()

> **sortSeedsByDependencies**(`seeds`): [`Seed`](../interfaces/Seed.md)[]

Returns the input seeds reordered so that every seed appears AFTER all the
seeds it depends on (its `relation` branch targets). Pure function — does
not read from any global registry.

Uses Kahn's algorithm (BFS on in-degree) for cycle detection and topological
ordering. Sprint 3 (CLI / migration runner) consumes this to create tables in
the correct order without disabling SQLite FK constraints.

## Parameters

### seeds

readonly [`Seed`](../interfaces/Seed.md)[]

## Returns

[`Seed`](../interfaces/Seed.md)[]

## Throws

When a relation targets an unknown slug not in `seeds`.

## Throws

When a cyclic dependency is detected, listing involved slugs.
