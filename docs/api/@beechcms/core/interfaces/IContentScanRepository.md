[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IContentScanRepository

# Interface: IContentScanRepository

## Methods

### getReferencedMediaKeys()

> **getReferencedMediaKeys**(`seeds`): `Promise`&lt;`Set`&lt;`string`&gt;&gt;

Scans across all registered seeds to identify media keys that are currently referenced
by any content entry. Used for orphaned media detection and storage analytics.

#### Parameters

##### seeds

[`Seed`](Seed.md)[]

#### Returns

`Promise`&lt;`Set`&lt;`string`&gt;&gt;
