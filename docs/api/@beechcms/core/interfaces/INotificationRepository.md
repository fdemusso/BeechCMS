[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / INotificationRepository

# Interface: INotificationRepository

## Methods

### create()

> **create**(`record`): `Promise`&lt;`string`&gt;

Insert a new notification and return its generated id so callers (e.g.
the public form submission flow) can correlate the notification with the
triggering request.

#### Parameters

##### record

`Omit`&lt;[`NotificationRecord`](NotificationRecord.md), `"id"` \| `"createdAt"` \| `"isRead"`&gt;

#### Returns

`Promise`&lt;`string`&gt;

***

### delete()

> **delete**(`notificationId`): `Promise`&lt;`void`&gt;

#### Parameters

##### notificationId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### list()

> **list**(`limit`): `Promise`&lt;[`NotificationRecord`](NotificationRecord.md)[]&gt;

Return the most recent notifications, newest first.

The `limit` parameter is required to prevent unbounded reads — the inbox
could grow large over time and clients only ever render a window.

#### Parameters

##### limit

`number`

#### Returns

`Promise`&lt;[`NotificationRecord`](NotificationRecord.md)[]&gt;

***

### markAllRead()

> **markAllRead**(): `Promise`&lt;`void`&gt;

#### Returns

`Promise`&lt;`void`&gt;

***

### markRead()

> **markRead**(`notificationId`): `Promise`&lt;`void`&gt;

#### Parameters

##### notificationId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### markUnread()

> **markUnread**(`notificationId`): `Promise`&lt;`void`&gt;

#### Parameters

##### notificationId

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### stats()

> **stats**(): `Promise`&lt;[`NotificationStats`](NotificationStats.md)&gt;

Return aggregate counters used to build the GET /notifications ETag.

Computing `totalCount`, `latestCreatedAt` and `readCount` on the database
side lets the handler skip serialising the full list when nothing has
changed since the client's last poll, saving bandwidth on the dashboard.

#### Returns

`Promise`&lt;[`NotificationStats`](NotificationStats.md)&gt;
