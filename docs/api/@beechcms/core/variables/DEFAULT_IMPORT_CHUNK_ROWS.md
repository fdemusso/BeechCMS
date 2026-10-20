[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DEFAULT\_IMPORT\_CHUNK\_ROWS

# Variable: DEFAULT\_IMPORT\_CHUNK\_ROWS

> `const` **DEFAULT\_IMPORT\_CHUNK\_ROWS**: `500` = `500`

Rows an import consumer processes per queue invocation before persisting its offset
and re-enqueuing (brief §2). Sized well under the Workers CPU budget so a chunk that
retries repeats at most this many already-inserted rows.
