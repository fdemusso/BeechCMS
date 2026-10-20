[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / CreateNotificationRecord

# Type Alias: CreateNotificationRecord

> **CreateNotificationRecord** = `Omit`&lt;[`NotificationRecord`](../interfaces/NotificationRecord.md), `"id"` \| `"createdAt"` \| `"isRead"`&gt; & `object`

Input of [INotificationRepository.create](../interfaces/INotificationRepository.md#create).

## Type Declaration

### dedupeKey?

> `optional` **dedupeKey?**: `string`

Stable identifier of the upstream event (e.g. a QStash message id). Creating twice with the
same key stores one notification, so at-least-once delivery cannot inflate the inbox.
