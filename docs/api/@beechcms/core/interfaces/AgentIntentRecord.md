[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / AgentIntentRecord

# Interface: AgentIntentRecord

A stored agent request awaiting (or past) a human decision.

## Properties

### body

> **body**: `string` \| `null`

Raw request body text; `null` when the request had none.

***

### bodyHash

> **bodyHash**: `string`

`intentPayloadHash(method, path, body)`.

***

### clientId

> **clientId**: `string`

***

### createdAt

> **createdAt**: `number`

Unix seconds.

***

### decidedAt

> **decidedAt**: `number` \| `null`

***

### expiresAt

> **expiresAt**: `number`

***

### id

> **id**: `string`

***

### method

> **method**: [`OperationMethod`](../type-aliases/OperationMethod.md)

***

### operationId

> **operationId**: `string`

***

### path

> **path**: `string`

Path including the query string, exactly as received (`/api/content/posts/e1?purge=true`).

***

### resultBody

> **resultBody**: `string` \| `null`

***

### resultStatus

> **resultStatus**: `number` \| `null`

***

### risk

> **risk**: [`AgentIntentRisk`](../type-aliases/AgentIntentRisk.md)

***

### status

> **status**: [`AgentIntentStatus`](../type-aliases/AgentIntentStatus.md)

***

### summary

> **summary**: `string`

***

### userId

> **userId**: `string`
