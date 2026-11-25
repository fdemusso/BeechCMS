[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OperationRiskRule

# Type Alias: OperationRiskRule

> **OperationRiskRule** = [`OperationRisk`](OperationRisk.md) \| ((`input`) => [`OperationRisk`](OperationRisk.md))

Risk of an agent operation: either static, or derived from the request when the same
route can be a plain write or a publish/destructive action. Rules never throw.
