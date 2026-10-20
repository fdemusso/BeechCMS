[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / parseMediaTransformQuery

# Function: parseMediaTransformQuery()

> **parseMediaTransformQuery**(`params`): [`MediaTransformQuery`](../type-aliases/MediaTransformQuery.md)

Classifies a media query string. Pure: does not consult the catalog (that is env-dependent and
resolved by the caller), so an unknown-but-well-formed preset name returns `transform`.

## Parameters

### params

`URLSearchParams`

## Returns

[`MediaTransformQuery`](../type-aliases/MediaTransformQuery.md)
