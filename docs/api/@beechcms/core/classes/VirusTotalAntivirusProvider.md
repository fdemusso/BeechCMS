[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / VirusTotalAntivirusProvider

# Class: VirusTotalAntivirusProvider

## Implements

- [`IAntivirusProvider`](../interfaces/IAntivirusProvider.md)

## Constructors

### Constructor

> **new VirusTotalAntivirusProvider**(`apiKey?`): `VirusTotalAntivirusProvider`

#### Parameters

##### apiKey?

`string`

#### Returns

`VirusTotalAntivirusProvider`

## Properties

### name

> `readonly` **name**: `"virustotal"` = `'virustotal'`

#### Implementation of

[`IAntivirusProvider`](../interfaces/IAntivirusProvider.md).[`name`](../interfaces/IAntivirusProvider.md#name)

## Methods

### scan()

> **scan**(`fileBuffer`, `filename`): `Promise`&lt;[`AntivirusScanResult`](../interfaces/AntivirusScanResult.md)&gt;

#### Parameters

##### fileBuffer

`ArrayBuffer` \| `Uint8Array`&lt;`ArrayBufferLike`&gt;

##### filename

`string`

#### Returns

`Promise`&lt;[`AntivirusScanResult`](../interfaces/AntivirusScanResult.md)&gt;

#### Implementation of

[`IAntivirusProvider`](../interfaces/IAntivirusProvider.md).[`scan`](../interfaces/IAntivirusProvider.md#scan)
