[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / filterDashboardLayoutForViewer

# Function: filterDashboardLayoutForViewer()

> **filterDashboardLayoutForViewer**(`layout`, `viewer`): [`FilteredDashboardLayout`](../interfaces/FilteredDashboardLayout.md)

The part of a layout one viewer may receive. The layout is never the authority: this
projection is applied by the server before serving, and data routes enforce RBAC on their own.

An editor receives the real structure, with every widget they cannot use swapped in place for an
opaque [LOCKED\_WIDGET\_TYPE](../variables/LOCKED_WIDGET_TYPE.md) placeholder. A reader never learns that such widgets exist.

## Parameters

### layout

[`DashboardLayout`](../interfaces/DashboardLayout.md)

### viewer

[`DashboardLayoutViewer`](../interfaces/DashboardLayoutViewer.md)

## Returns

[`FilteredDashboardLayout`](../interfaces/FilteredDashboardLayout.md)
