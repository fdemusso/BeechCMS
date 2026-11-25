[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OPERATION\_CATALOG

# Variable: OPERATION\_CATALOG

> `const` **OPERATION\_CATALOG**: readonly [`OperationSpec`](../type-aliases/OperationSpec.md)[]

Every HTTP operation `createBeechApp()` mounts (custom routes excepted), with its
agent exposure, required OAuth scope and risk. Kept in lock-step with the router by
`apps/api/src/factory.operations-parity.test.ts`; lookup goes through `matchOperation()`.
