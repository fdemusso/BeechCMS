[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / hasDashboardLayoutStructuralChange

# Function: hasDashboardLayoutStructuralChange()

> **hasDashboardLayoutStructuralChange**(`stored`, `next`): `boolean`

Whether `next` changes anything a `manage_layout`-only editor may not change: the tab set, their order,
or a tab's `id`, `slug`, `label`, `icon` or `roles`. Only `sections` are content. With nothing stored,
every save is structural (creating tabs is structural).

## Parameters

### stored

[`DashboardLayout`](../interfaces/DashboardLayout.md) \| `null`

### next

[`DashboardLayout`](../interfaces/DashboardLayout.md)

## Returns

`boolean`
