[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveOperationRisk

# Function: resolveOperationRisk()

> **resolveOperationRisk**(`operation`, `input`): [`OperationRisk`](../type-aliases/OperationRisk.md)

Resolves the effective risk of an agent operation for one request.

## Parameters

### operation

[`AgentOperationSpec`](../interfaces/AgentOperationSpec.md)

An `agent` entry of [OPERATION\_CATALOG](../variables/OPERATION_CATALOG.md).

### input

[`OperationRiskInput`](../interfaces/OperationRiskInput.md)

The request query and parsed JSON body (`undefined` when absent).

## Returns

[`OperationRisk`](../type-aliases/OperationRisk.md)

The static risk as is, or the result of the operation's request-dependent rule.
