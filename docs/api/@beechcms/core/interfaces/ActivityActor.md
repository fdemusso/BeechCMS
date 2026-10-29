[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ActivityActor

# Interface: ActivityActor

Identifies the human (or machine) actor that triggered the event.

The actor MUST be assembled by the caller (typically a Hono handler that has
already authenticated the request). The logger never reaches into a
framework-specific context to discover who is acting — this avoids hidden
coupling and lets the same logger run inside CLI scripts and background
jobs.

## Properties

### email

> **email**: `string`

***

### id

> **id**: `string`

***

### name?

> `optional` **name?**: `string` \| `null`
