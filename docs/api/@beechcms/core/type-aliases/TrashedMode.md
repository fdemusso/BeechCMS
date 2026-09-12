[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / TrashedMode

# Type Alias: TrashedMode

> **TrashedMode** = `"active"` \| `"trashed"` \| `"any"`

Soft-delete visibility for a read.
 - 'active'  (default) — only rows with `deleted_at IS NULL`
 - 'trashed'           — only rows with `deleted_at IS NOT NULL` (the Trash view)
 - 'any'               — no predicate (restore/purge lookups, reconciliation)
Ignored entirely for seeds without `softDelete: true`.
