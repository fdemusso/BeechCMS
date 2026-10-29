[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IAnalyticsRepository

# Interface: IAnalyticsRepository

Read/write contract for the analytics counters that power the dashboard
widgets (per-day request totals, sparklines, system health proxy).

Implementations must use idempotent upserts so the recording middleware
can be invoked once per request without producing duplicates when the
same day/seed/metric tuple is touched repeatedly.

## Methods

### groupByMetric()

> **groupByMetric**(`seedSlug`, `sinceTimestamp`): `Promise`&lt;`Record`&lt;`string`, `number`&gt;&gt;

Returns a map of date strings (YYYY-MM-DD) to request counts since
sinceTimestamp, suitable for chart rendering without further
transformation by the caller.

#### Parameters

##### seedSlug

`string`

##### sinceTimestamp

`number`

#### Returns

`Promise`&lt;`Record`&lt;`string`, `number`&gt;&gt;

***

### recordRequest()

> **recordRequest**(`seedSlug`): `Promise`&lt;`void`&gt;

Upserts a request counter for the given seed at the current day bucket.
The day bucket (Unix timestamp truncated to midnight UTC) is computed
internally from the implementation's clock so callers never need to
pass a timestamp. Implementations must use INSERT ... ON CONFLICT DO
UPDATE to remain idempotent under concurrent calls within the same day.

#### Parameters

##### seedSlug

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### sumByMetric()

> **sumByMetric**(`metric`, `seedSlug`, `sinceTimestamp`): `Promise`&lt;`number`&gt;

Returns the total count for the given metric since sinceTimestamp.
Used by the stats handler for total request counts and visitor counts.
The aggregation sums the stored counter values, not row counts.

#### Parameters

##### metric

[`AnalyticsMetric`](../type-aliases/AnalyticsMetric.md)

##### seedSlug

`string`

##### sinceTimestamp

`number`

#### Returns

`Promise`&lt;`number`&gt;
