[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IActivityLogRepository

# Interface: IActivityLogRepository

## Methods

### countSince()

> **countSince**(`options`): `Promise`&lt;`number`&gt;

Count entries with the given `action` and `entityType` whose `createdAt`
is greater-than-or-equal to `sinceTimestamp`.

Used by the dashboard `/stats/total` widget to surface today/week/month
create-event counts without hardcoding SQL in the handler. Each period
is one call so the repository contract stays narrow and deterministic.

#### Parameters

##### options

[`CountSinceOptions`](CountSinceOptions.md)

#### Returns

`Promise`&lt;`number`&gt;

***

### list()

> **list**(`options`): `Promise`&lt;[`ActivityLogRecord`](ActivityLogRecord.md)[]&gt;

Return the most recent activity entries matching the given filters.

The list is always ordered by `createdAt` DESC so callers get newest-first
data without paying extra sort costs in TypeScript. Used by the settings
activity tab (per-user) and by the stats recent-activity feed (global).

#### Parameters

##### options

[`ActivityLogListOptions`](ActivityLogListOptions.md)

#### Returns

`Promise`&lt;[`ActivityLogRecord`](ActivityLogRecord.md)[]&gt;
