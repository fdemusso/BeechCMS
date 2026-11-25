[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / requiresConfirmation

# Function: requiresConfirmation()

> **requiresConfirmation**(`risk`, `environment`): `boolean`

Whether an OAuth request of this risk must become an intent instead of running.
`destructive` always; `publish` only in production; `read` / `write` never.

## Parameters

### risk

[`OperationRisk`](../type-aliases/OperationRisk.md)

### environment

[`AgentEnvironment`](../type-aliases/AgentEnvironment.md)

## Returns

`boolean`
