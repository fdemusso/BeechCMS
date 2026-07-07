[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IContentScanRepository

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
