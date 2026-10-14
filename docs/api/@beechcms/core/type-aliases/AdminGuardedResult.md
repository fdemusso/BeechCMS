[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AdminGuardedResult

# Type Alias: AdminGuardedResult

> **AdminGuardedResult** = `"applied"` \| `"not-found"` \| `"last-global-admin"`

Outcome of a write that must never remove the platform's last active global
administrator. The repository enforces the invariant inside the write itself (one
conditional statement), so two concurrent requests cannot both pass a stale count.
- `applied`: the write happened.
- `not-found`: the target does not exist (or is an immutable system role); nothing changed.
- `last-global-admin`: refused because it would leave no other active global administrator.
