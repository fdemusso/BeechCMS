[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IContentScanRepository

# Interface: IContentScanRepository

## Methods

### getReferencedMediaKeys()

> **getReferencedMediaKeys**(`seeds`, `options?`): `Promise`&lt;`Set`&lt;`string`&gt;&gt;

Scans across all registered seeds to identify media keys that are currently referenced
by any content entry, live or draft. Used for orphaned media detection and storage analytics.

A caching implementation may answer from a recent scan; `fresh` forces a new one and is
required before any destructive decision (deleting a file).

#### Parameters

##### seeds

[`Seed`](Seed.md)[]

##### options?

###### fresh?

`boolean`

#### Returns

`Promise`&lt;`Set`&lt;`string`&gt;&gt;
