[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / schemaApply

# Function: schemaApply()

> **schemaApply**(`args?`): `Promise`&lt;`void`&gt;

Applies `beech.schema.ts` to the deployed schema through the control plane.

Three phases, in order: plan everything and show it; confirm once; then apply seed by seed, each one
re-planned immediately before its write so the OCC version is current and the statements are still
the ones the operator approved. Additive only — a seed present in D1 and absent from the manifest is
never touched, and destructive intent is refused by the server before anything executes.

## Parameters

### args?

[`SchemaApplyOptions`](../interfaces/SchemaApplyOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
