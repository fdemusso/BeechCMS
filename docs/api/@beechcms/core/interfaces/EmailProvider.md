[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / EmailProvider

# Interface: EmailProvider

Formal contract for email sending providers.

Every implementation (Resend, SMTP, …) must comply with this interface.
It is the only point of coupling between the email module and any external service.

To add a new provider: create a class in apps/api/src/shared/email/providers/
that implements this interface, then wire it in email.service.ts.

## Methods

### send()

> **send**(`email`): `Promise`&lt;`void`&gt;

Sends a single transactional email.

#### Parameters

##### email

[`OutboundEmail`](OutboundEmail.md)

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

If the provider rejects the request. The caller is responsible
                for catching and handling this error appropriately.
