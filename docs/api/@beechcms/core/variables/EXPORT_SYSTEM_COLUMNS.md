[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / EXPORT\_SYSTEM\_COLUMNS

# Variable: EXPORT\_SYSTEM\_COLUMNS

> `const` **EXPORT\_SYSTEM\_COLUMNS**: readonly \[`"id"`, `"slug"`, `"status"`, `"created_at"`, `"updated_at"`\]

System columns exported for every seed, in this order, ahead of the branch columns.
`deleted_at` is deliberately absent: a trashed row is not exportable content, and the
repository's default `trashed: 'active'` mode never hands one to the producer anyway.
