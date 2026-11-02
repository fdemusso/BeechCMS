[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateDefaultDashboardLayout

# Function: generateDefaultDashboardLayout()

> **generateDefaultDashboardLayout**(`seeds`, `permissions`, `opts?`): [`DashboardLayout`](../interfaces/DashboardLayout.md)

Structural port of the legacy hardcoded dashboard config into a single
 'Overview' page. Widgets fetch their own data: configs carry only the
 variant and (where relevant) the default seed binding. The default contains
 only what `permissions` can use: seed bindings take readable seeds only and
 widgets whose requirement is unmet are dropped, so it may come back with no pages.

## Parameters

### seeds

[`Seed`](../interfaces/Seed.md)[]

### permissions

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

### opts?

#### newId

() => `string`

## Returns

[`DashboardLayout`](../interfaces/DashboardLayout.md)
