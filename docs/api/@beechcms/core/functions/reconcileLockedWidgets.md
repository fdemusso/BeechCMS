[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / reconcileLockedWidgets

# Function: reconcileLockedWidgets()

> **reconcileLockedWidgets**(`stored`, `next`, `permissions`): [`LockedWidgetReconciliation`](../type-aliases/LockedWidgetReconciliation.md)

The layout to persist from what an editor sent. Each widget of `stored` that `permissions` cannot use
(`isWidgetLockedFor`) is taken back verbatim from `stored`; the client is never trusted on it.

## Parameters

### stored

[`DashboardLayout`](../interfaces/DashboardLayout.md) \| `null`

### next

[`DashboardLayout`](../interfaces/DashboardLayout.md)

### permissions

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

## Returns

[`LockedWidgetReconciliation`](../type-aliases/LockedWidgetReconciliation.md)
