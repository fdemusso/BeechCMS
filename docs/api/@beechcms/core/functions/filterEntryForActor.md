[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / filterEntryForActor

# Function: filterEntryForActor()

> **filterEntryForActor**(`data`, `seed`, `actor?`): `Record`&lt;`string`, `unknown`&gt;

Filters entry payload fields based on the caller's [ActorContext](../interfaces/ActorContext.md) and branch classification tier.

Rules:
- Public actor: receives `public` fields; `internal`, `confidential`, and `restricted` fields are omitted.
- Authenticated actor: receives `public`, `internal`, and `confidential` fields; `restricted` fields are ALWAYS omitted.
- System actor: receives all fields including `restricted` (used for internal worker/automation orchestration).

## Parameters

### data

`Record`&lt;`string`, `unknown`&gt;

Raw record fields object.

### seed

[`Seed`](../interfaces/Seed.md)

Content type seed definition containing branch definitions.

### actor?

[`ActorContext`](../interfaces/ActorContext.md) = `...`

Context of the caller requesting the entry payload (defaults to authenticated).

## Returns

`Record`&lt;`string`, `unknown`&gt;

Filtered data record containing only authorized fields for the given actor context.
