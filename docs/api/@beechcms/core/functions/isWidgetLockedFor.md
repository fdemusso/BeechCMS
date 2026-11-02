[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isWidgetLockedFor

# Function: isWidgetLockedFor()

> **isWidgetLockedFor**(`widget`, `permissions`): `boolean`

Whether `permissions` cannot use `widget`, as far as the server can tell: it is a placeholder, its
`config.seedSlug` names a seed they may not `content:read`, or it is a built-in whose core requirement
is unmet. A custom widget's own `requires` is invisible to the Worker and never locks it here.

## Parameters

### widget

`Pick`&lt;[`DashboardWidgetInstance`](../interfaces/DashboardWidgetInstance.md), `"type"` \| `"config"`&gt;

### permissions

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

## Returns

`boolean`
