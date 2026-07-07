[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / resolvePolicies

# Function: resolvePolicies()

> **resolvePolicies**(`branch`): `Required`&lt;`NonNullable`&lt;[`Branch`](../interfaces/Branch.md)\[`"policies"`\]&gt;&gt;

Risolve le policy di un branch applicando i valori di default.
Tutta la logica di accesso ai campi deve passare per questa funzione,
mai con inline `branch.policies?.x ?? default`.

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

## Returns

`Required`&lt;`NonNullable`&lt;[`Branch`](../interfaces/Branch.md)\[`"policies"`\]&gt;&gt;
