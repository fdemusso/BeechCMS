[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / NoopAntivirusProvider

# Class: NoopAntivirusProvider

## Implements

- [`IAntivirusProvider`](../interfaces/IAntivirusProvider.md)

## Constructors

### Constructor

> **new NoopAntivirusProvider**(): `NoopAntivirusProvider`

#### Returns

`NoopAntivirusProvider`

## Properties

### name

> `readonly` **name**: `"noop"` = `'noop'`

#### Implementation of

[`IAntivirusProvider`](../interfaces/IAntivirusProvider.md).[`name`](../interfaces/IAntivirusProvider.md#name)

## Methods

### scan()

> **scan**(`_fileBuffer`, `_filename`): `Promise`&lt;[`AntivirusScanResult`](../interfaces/AntivirusScanResult.md)&gt;

#### Parameters

##### \_fileBuffer

`ArrayBuffer` \| `Uint8Array`&lt;`ArrayBufferLike`&gt;

##### \_filename

`string`

#### Returns

`Promise`&lt;[`AntivirusScanResult`](../interfaces/AntivirusScanResult.md)&gt;

#### Implementation of

[`IAntivirusProvider`](../interfaces/IAntivirusProvider.md).[`scan`](../interfaces/IAntivirusProvider.md#scan)
