[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / filterDashboardLayoutByWidgetRequirements

# Function: filterDashboardLayoutByWidgetRequirements()

> **filterDashboardLayoutByWidgetRequirements**(`layout`, `permissions`, `requirementOf`): [`DashboardLayout`](../interfaces/DashboardLayout.md)

Removes the widgets `permissions` cannot use, then the sections and pages that removal emptied.

## Parameters

### layout

[`DashboardLayout`](../interfaces/DashboardLayout.md)

### permissions

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

### requirementOf

[`WidgetRequirementLookup`](../type-aliases/WidgetRequirementLookup.md)

## Returns

[`DashboardLayout`](../interfaces/DashboardLayout.md)
