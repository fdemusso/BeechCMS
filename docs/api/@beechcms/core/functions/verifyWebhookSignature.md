[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / verifyWebhookSignature

# Function: verifyWebhookSignature()

> **verifyWebhookSignature**(`body`, `signature`, `secret`): `Promise`&lt;`boolean`&gt;

Verifies an inbound signature against the recomputed HMAC.
Accepts the `sha256=` prefix on the provided signature (optional).

## Parameters

### body

`string`

### signature

`string` \| `null` \| `undefined`

### secret

`string`

## Returns

`Promise`&lt;`boolean`&gt;
