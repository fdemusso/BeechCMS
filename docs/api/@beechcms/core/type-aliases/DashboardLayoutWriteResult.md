[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DashboardLayoutWriteResult

# Type Alias: DashboardLayoutWriteResult

> **DashboardLayoutWriteResult** = \{ `ok`: `true`; `updatedAt`: `number` \| `null`; \} \| \{ `ok`: `false`; \}

## Union Members

### Type Literal

\{ `ok`: `true`; `updatedAt`: `number` \| `null`; \}

Written. `updatedAt` is the row's new version, null after a removal.

***

### Type Literal

\{ `ok`: `false`; \}

Refused: the stored version no longer equals the expected one.
