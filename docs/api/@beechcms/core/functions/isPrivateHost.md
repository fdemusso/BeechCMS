[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isPrivateHost

# Function: isPrivateHost()

> **isPrivateHost**(`hostname`): `boolean`

Whether a webhook target host is loopback, link-local, private or otherwise internal.
Expects `URL.hostname`, which the WHATWG parser already normalises: IPv6 literals stay bracketed
and IPv4-mapped tails are rewritten to hex, so the address is parsed, never string-matched.

## Parameters

### hostname

`string`

## Returns

`boolean`
