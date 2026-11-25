[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / IAgentIntentRepository

# Interface: IAgentIntentRepository

Storage contract for agent intents. Times are passed by the caller; the implementation mints ids.

## Methods

### create()

> **create**(`input`): `Promise`&lt;`string`&gt;

Stores a `pending` intent and returns its id.

#### Parameters

##### input

[`NewAgentIntentInput`](../type-aliases/NewAgentIntentInput.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### decide()

> **decide**(`intentId`, `userId`, `decision`, `now`): `Promise`&lt;`boolean`&gt;

Atomic `pending` → `approved` | `rejected`, only while `expiresAt > now` and only for this user.
TRUE only when THIS call performed the transition (single-use under concurrency).

#### Parameters

##### intentId

`string`

##### userId

`string`

##### decision

`"approved"` \| `"rejected"`

##### now

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### expire()

> **expire**(`intentId`, `userId`, `now`): `Promise`&lt;`boolean`&gt;

Atomic `pending` → `expired` for an intent whose `expiresAt <= now`. TRUE when it transitioned.

#### Parameters

##### intentId

`string`

##### userId

`string`

##### now

`number`

#### Returns

`Promise`&lt;`boolean`&gt;

***

### findForUser()

> **findForUser**(`intentId`, `userId`): `Promise`&lt;[`AgentIntentRecord`](AgentIntentRecord.md) \| `null`&gt;

One intent of this user, any status. Null when absent OR owned by someone else (indistinguishable on purpose).

#### Parameters

##### intentId

`string`

##### userId

`string`

#### Returns

`Promise`&lt;[`AgentIntentRecord`](AgentIntentRecord.md) \| `null`&gt;

***

### listPending()

> **listPending**(`userId`, `now`, `limit`): `Promise`&lt;[`AgentIntentRecord`](AgentIntentRecord.md)[]&gt;

This user's `pending` intents with `expiresAt > now`, newest first, at most `limit`.

#### Parameters

##### userId

`string`

##### now

`number`

##### limit

`number`

#### Returns

`Promise`&lt;[`AgentIntentRecord`](AgentIntentRecord.md)[]&gt;

***

### recordResult()

> **recordResult**(`intentId`, `outcome`, `resultStatus`, `resultBody`): `Promise`&lt;`void`&gt;

`approved` → `executed` | `failed` with the replay outcome. No-op on any other status.

#### Parameters

##### intentId

`string`

##### outcome

`"executed"` \| `"failed"`

##### resultStatus

`number`

##### resultBody

`string` \| `null`

#### Returns

`Promise`&lt;`void`&gt;
