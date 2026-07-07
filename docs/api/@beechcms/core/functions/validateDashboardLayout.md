[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / validateDashboardLayout

# Function: validateDashboardLayout()

> **validateDashboardLayout**(`layout`, `ctx`): [`ValidateDashboardLayoutResult`](../type-aliases/ValidateDashboardLayoutResult.md)

Semantic validation on top of the Zod shape check (the caller's job).
 Widgets bound to a seed that no longer exists are silently stripped
 (auto-cleanup, recorded as a warning). Unknown widget types only warn —
 custom widgets are invisible to the Worker and must never be stripped.
 `cleaned` is always returned, errors or not.

## Parameters

### layout

[`DashboardLayout`](../interfaces/DashboardLayout.md)

### ctx

[`DashboardLayoutContext`](../interfaces/DashboardLayoutContext.md)

## Returns

[`ValidateDashboardLayoutResult`](../type-aliases/ValidateDashboardLayoutResult.md)
