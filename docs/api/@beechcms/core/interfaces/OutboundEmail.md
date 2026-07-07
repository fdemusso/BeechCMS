[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OutboundEmail

# Interface: OutboundEmail

The resolved email message that the provider receives and sends.
Constructed by the service by combining call parameters with template builder output.

## Properties

### from

> **from**: `string`

Sender address in RFC 5321 format (e.g., "Beech CMS \<noreply@beechcms.dev\>").

***

### html

> **html**: `string`

Complete HTML body. Must be a valid HTML document (see templates/shell.ts).

***

### subject

> **subject**: `string`

***

### to

> **to**: `string`[]

List of recipient addresses. Must contain at least one element.
