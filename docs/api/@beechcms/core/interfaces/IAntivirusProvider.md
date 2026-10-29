[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IAntivirusProvider

# Interface: IAntivirusProvider

## Properties

### name

> `readonly` **name**: `string`

## Methods

### scan()

> **scan**(`fileBuffer`, `filename`): `Promise`&lt;[`AntivirusScanResult`](AntivirusScanResult.md)&gt;

#### Parameters

##### fileBuffer

`ArrayBuffer` \| `Uint8Array`&lt;`ArrayBufferLike`&gt;

##### filename

`string`

#### Returns

`Promise`&lt;[`AntivirusScanResult`](AntivirusScanResult.md)&gt;
