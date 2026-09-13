[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / FormatCompatibility

# Type Alias: FormatCompatibility

> **FormatCompatibility** = \{ `compatible`: `true`; \} \| \{ `code`: `"csv_requires_flat_seed"`; `compatible`: `false`; `offendingBranches`: `object`[]; \}

Outcome of checking a requested format against a seed's shape.
`offendingBranches` is non-empty only on the incompatible branch, and exists so the
caller can name the exact fields in its 400 response instead of a generic message.
