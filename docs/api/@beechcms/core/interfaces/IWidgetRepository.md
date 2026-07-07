[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IWidgetRepository

# Interface: IWidgetRepository

Read-only data access contract for widget routes.

Implementations must validate every column alias derived from user input
against the seed before composing SQL, and must bind every user-supplied
value via parameterised statements. SQL keywords (ORDER direction, aggregate
function names) must be selected via hardcoded branches, never interpolated.

## Methods

### aggregate()

> **aggregate**(`seed`, `formula`, `window`): `Promise`&lt;`number`&gt;

Returns the formula result for the given time window. Always returns a
number; implementations must return 0 when the query produces no rows.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### formula

[`AggregateFormula`](../type-aliases/AggregateFormula.md)

##### window

[`WidgetWindow`](../type-aliases/WidgetWindow.md)

#### Returns

`Promise`&lt;`number`&gt;

***

### distribution()

> **distribution**(`seed`, `column`, `window`, `limit`): `Promise`&lt;[`DistributionSlice`](DistributionSlice.md)[]&gt;

Counts entries grouped by the values of `column` within the window,
descending by count, capped at `limit` slices. Implementations must
validate `column` against the seed (UNSAFE_COLUMN on failure) and must
return [] on empty results. Values beyond `limit` are NOT merged into
an 'other' bucket — the client decides how to present truncation.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### column

`string`

##### window

[`WidgetWindow`](../type-aliases/WidgetWindow.md)

##### limit

`number`

#### Returns

`Promise`&lt;[`DistributionSlice`](DistributionSlice.md)[]&gt;

***

### growth()

> **growth**(`seed`, `formula`, `window`): `Promise`&lt;[`GrowthResult`](GrowthResult.md)&gt;

Evaluates the formula twice — once for the current window period and once
for the equivalent previous period — to support trend calculations.
Implementations must return \{ currentValue: 0, previousValue: 0 \} on
empty results.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### formula

[`AggregateFormula`](../type-aliases/AggregateFormula.md)

##### window

[`WidgetWindow`](../type-aliases/WidgetWindow.md)

#### Returns

`Promise`&lt;[`GrowthResult`](GrowthResult.md)&gt;

***

### leaderboard()

> **leaderboard**(`seed`, `options`): `Promise`&lt;[`LeaderboardEntry`](LeaderboardEntry.md)[]&gt;

Returns entries sorted by scoreColumn, excluding nulls. label resolves
from seed.displayNameAlias; falls back to id when not set.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### options

[`LeaderboardOptions`](LeaderboardOptions.md)

#### Returns

`Promise`&lt;[`LeaderboardEntry`](LeaderboardEntry.md)[]&gt;

***

### list()

> **list**(`seed`, `options`): `Promise`&lt;[`WidgetListResult`](WidgetListResult.md)&gt;

Paginated read of content entries. Filters and search are applied
server-side. The caller is responsible for deserialising branch values
from the raw Record.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### options

[`WidgetListOptions`](WidgetListOptions.md)

#### Returns

`Promise`&lt;[`WidgetListResult`](WidgetListResult.md)&gt;

***

### timeseries()

> **timeseries**(`seed`, `formula`, `window`, `groupColumn`): `Promise`&lt;[`TimeseriesPoint`](TimeseriesPoint.md)[]&gt;

Groups entries by a date bucket derived from groupColumn and aggregates
the formula. Days with no entries are omitted (no zero-fill). Points are
ordered ascending by label.

#### Parameters

##### seed

[`Seed`](Seed.md)

##### formula

[`AggregateFormula`](../type-aliases/AggregateFormula.md)

##### window

[`WidgetWindow`](../type-aliases/WidgetWindow.md)

##### groupColumn

`string`

#### Returns

`Promise`&lt;[`TimeseriesPoint`](TimeseriesPoint.md)[]&gt;
