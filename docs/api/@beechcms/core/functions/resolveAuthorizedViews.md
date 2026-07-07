[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / resolveAuthorizedViews

# Function: resolveAuthorizedViews()

> **resolveAuthorizedViews**(`seed`): [`DashboardView`](../type-aliases/DashboardView.md)[]

Resolves the effective, deduplicated, canonically-ordered authorized views for a seed.
Invariants:
 - 'table' is ALWAYS present (universal fallback — relational backing).
 - Unknown/legacy values are stripped.
 - Empty/undefined config → DEFAULT_AUTHORIZED_VIEWS (then table-guaranteed).

## Parameters

### seed

`Pick`&lt;[`Seed`](../interfaces/Seed.md), `"dashboard"`&gt;

## Returns

[`DashboardView`](../type-aliases/DashboardView.md)[]
