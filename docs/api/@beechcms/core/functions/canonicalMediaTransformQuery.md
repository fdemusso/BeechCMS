[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / canonicalMediaTransformQuery

# Function: canonicalMediaTransformQuery()

> **canonicalMediaTransformQuery**(`request`): `string`

Canonical query for a request: fixed order preset → format → quality, defaults omitted.
`@beechcms/client` emits exactly this string; the server recomputes it and never trusts the client's.

## Parameters

### request

[`MediaTransformRequest`](../interfaces/MediaTransformRequest.md)

## Returns

`string`
