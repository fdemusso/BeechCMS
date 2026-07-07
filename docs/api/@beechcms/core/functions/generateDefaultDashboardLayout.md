[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / generateDefaultDashboardLayout

# Function: generateDefaultDashboardLayout()

> **generateDefaultDashboardLayout**(`seeds`, `opts?`): [`DashboardLayout`](../interfaces/DashboardLayout.md)

Structural port of the legacy hardcoded dashboard config into a single
 'Overview' page. Widgets fetch their own data: configs carry only the
 variant and (where relevant) the default seed binding.

## Parameters

### seeds

[`Seed`](../interfaces/Seed.md)[]

### opts?

#### newId

() => `string`

## Returns

[`DashboardLayout`](../interfaces/DashboardLayout.md)
