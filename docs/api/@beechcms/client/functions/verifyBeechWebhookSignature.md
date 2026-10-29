[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / verifyBeechWebhookSignature

# Function: verifyBeechWebhookSignature()

> **verifyBeechWebhookSignature**(`options`): `Promise`&lt;`boolean`&gt;

Validates an inbound BeechCMS webhook signature against a shared secret in constant time.
Returns `false` without throwing if the payload, signature, or secret is invalid or mismatching.
Accepts both `sha256=<hex>` and raw `<hex>` formats.

## Parameters

### options

[`VerifyWebhookSignatureOptions`](../interfaces/VerifyWebhookSignatureOptions.md)

## Returns

`Promise`&lt;`boolean`&gt;
