[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / computeMediaVariantEtag

# Function: computeMediaVariantEtag()

> **computeMediaVariantEtag**(`source`, `request`, `preset`): `Promise`&lt;`string`&gt;

Strong ETag of a variant: source identity (key + size — keys are never overwritten) plus the
canonical request plus the preset definition. Format: `"mv1-<32 hex>"`.

## Parameters

### source

#### key

`string`

#### size

`number`

### request

[`MediaTransformRequest`](../interfaces/MediaTransformRequest.md)

### preset

[`MediaPreset`](../type-aliases/MediaPreset.md)

## Returns

`Promise`&lt;`string`&gt;
