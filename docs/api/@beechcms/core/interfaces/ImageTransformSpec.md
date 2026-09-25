[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ImageTransformSpec

# Interface: ImageTransformSpec

A fully resolved transformation. Every number here comes from a pre-registered preset or from
MEDIA_QUALITY_VALUES — never from the request.

## Properties

### fit

> `readonly` **fit**: `"cover"` \| `"scale-down"`

***

### height?

> `readonly` `optional` **height?**: `number`

Present for crop presets only; scale presets derive height from the source aspect ratio.

***

### outputMime

> `readonly` **outputMime**: [`ImageOutputMime`](../type-aliases/ImageOutputMime.md)

***

### quality

> `readonly` **quality**: `number`

***

### width

> `readonly` **width**: `number`
