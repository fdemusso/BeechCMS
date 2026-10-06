[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / findUnappliedFilters

# Function: findUnappliedFilters()

> **findUnappliedFilters**(`seed`, `filters`): [`FilterGroup`](../interfaces/FilterGroup.md)[]

Lists the filter groups `buildSelectQuery` would silently leave out of the WHERE clause: an unknown
column, or a condition whose value cannot be bound for the field type (empty or unparsable
number/date, `in` with no usable values). A caller that needs the filter to constrain the read
(e.g. automations resolving placeholders at run time) uses this to refuse the query instead of
running it unconstrained.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed the filters apply to.

### filters

[`FilterGroup`](../interfaces/FilterGroup.md)[]

The filter groups to check.

## Returns

[`FilterGroup`](../interfaces/FilterGroup.md)[]

The groups that would be dropped, in input order.
