[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ISearchRepository

# Interface: ISearchRepository

Read-only contract for the global FTS5 search route.

Implementations encapsulate the UNION ALL query that fans out across all
`fts_<seed>` virtual tables. The route handler stays free of D1 and only
shapes the final response.

## Methods

### count()

> **count**(`options`, `seeds`): `Promise`&lt;[`SearchCountResult`](SearchCountResult.md)&gt;

Runs the count variant of the FTS query to support the `total` field in
the search response. Called in parallel with search() by the route handler
with the same filter inputs but without limit/cursor.

#### Parameters

##### options

`Omit`&lt;[`SearchQueryOptions`](SearchQueryOptions.md), `"limit"` \| `"cursor"`&gt;

##### seeds

[`Seed`](Seed.md)[]

#### Returns

`Promise`&lt;[`SearchCountResult`](SearchCountResult.md)&gt;

***

### search()

> **search**(`options`, `seeds`): `Promise`&lt;[`SearchResultRow`](SearchResultRow.md)[]&gt;

Executes a UNION ALL full-text search across all FTS-enabled seed tables.
Returns at most options.limit + 1 rows so the caller can detect hasMore
without a separate count query for the cursor case.
Implementations must propagate the EMPTY_QUERY error thrown by
buildFtsQuery so the route handler can return an empty result set rather
than a 500.

#### Parameters

##### options

[`SearchQueryOptions`](SearchQueryOptions.md)

##### seeds

[`Seed`](Seed.md)[]

#### Returns

`Promise`&lt;[`SearchResultRow`](SearchResultRow.md)[]&gt;
