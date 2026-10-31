[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DashboardLayoutViewer

# Interface: DashboardLayoutViewer

Who is looking at the dashboard, as resolved for one request.

## Properties

### permissions

> `readonly` **permissions**: [`EffectivePermissions`](EffectivePermissions.md)

The caller's effective authority.

***

### roleIds

> `readonly` **roleIds**: `ReadonlySet`&lt;`string`&gt;

Ids of the roles the caller holds through at least one active (decay-filtered) assignment, at any scope.
