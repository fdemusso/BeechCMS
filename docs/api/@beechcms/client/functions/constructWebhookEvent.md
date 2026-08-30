[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / constructWebhookEvent

# Function: constructWebhookEvent()

> **constructWebhookEvent**&lt;`T`&gt;(`options`): `Promise`&lt;`T`&gt;

Verifies the HMAC signature and deserializes the JSON payload into type `T`.
Throws `WebhookVerificationError` on missing parameters or cryptographic signature failure.
Lets `SyntaxError` surface naturally if JSON parsing fails on a valid payload.

## Type Parameters

### T

`T` = `Record`&lt;`string`, `unknown`&gt;

## Parameters

### options

[`ConstructWebhookEventOptions`](../interfaces/ConstructWebhookEventOptions.md)

## Returns

`Promise`&lt;`T`&gt;
