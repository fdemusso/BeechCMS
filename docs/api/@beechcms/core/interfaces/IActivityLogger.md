[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IActivityLogger

# Interface: IActivityLogger

## Methods

### log()

> **log**(`entry`): `void` \| `Promise`&lt;`void`&gt;

Persist a single activity entry.

Implementations decide whether to fire-and-forget (Cloudflare
`executionCtx.waitUntil`) or to wait inline (test environments).
In either case the call MUST NOT throw to the caller: logging is
observability, never a hard dependency of the request being served.
Internal errors must be swallowed and logged via `console.error` so the
mainline response path is never disturbed by audit-trail failures.

#### Parameters

##### entry

[`ActivityLogEntry`](ActivityLogEntry.md)

#### Returns

`void` \| `Promise`&lt;`void`&gt;
