[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IImageTransformer

# Interface: IImageTransformer

Port for edge image transformation. The API injects a Cloudflare Images adapter when the
`IMAGES` binding exists and `null` otherwise; handlers never see the binding itself.

## Methods

### probe()

> **probe**(`source`): `Promise`&lt;[`MediaDimensions`](MediaDimensions.md)&gt;

Reads the source's pixel dimensions. Rejects when the stream is not a raster image.

#### Parameters

##### source

`ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

#### Returns

`Promise`&lt;[`MediaDimensions`](MediaDimensions.md)&gt;

***

### transform()

> **transform**(`source`, `spec`): `Promise`&lt;[`TransformedImage`](TransformedImage.md)&gt;

Applies the spec and returns the encoded variant.

#### Parameters

##### source

`ReadableStream`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

##### spec

[`ImageTransformSpec`](ImageTransformSpec.md)

#### Returns

`Promise`&lt;[`TransformedImage`](TransformedImage.md)&gt;
