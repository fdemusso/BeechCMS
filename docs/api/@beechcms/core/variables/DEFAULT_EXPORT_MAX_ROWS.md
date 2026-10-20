[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DEFAULT\_EXPORT\_MAX\_ROWS

# Variable: DEFAULT\_EXPORT\_MAX\_ROWS

> `const` **DEFAULT\_EXPORT\_MAX\_ROWS**: `50000` = `50_000`

Hard cap on rows a single synchronous export may stream (brief §2). Past this the
endpoint answers 413 rather than opening a stream that the edge may truncate mid-file.
Overridable per deployment by the API layer (S2) — this is the default, not the law.
