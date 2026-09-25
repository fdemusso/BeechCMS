[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / mediaSrcSet

# Function: mediaSrcSet()

> **mediaSrcSet**(`keyOrUrl`, `presets`, `options?`): `string`

`srcset` value built only from scale presets (`w-<width>`), ascending, de-duplicated.
Crop presets are refused: a srcset of fixed crops would lie about intrinsic widths.

## Parameters

### keyOrUrl

`string`

### presets

readonly `` `w-${number}` ``[]

### options?

[`MediaUrlOptions`](../interfaces/MediaUrlOptions.md) = `{}`

## Returns

`string`
