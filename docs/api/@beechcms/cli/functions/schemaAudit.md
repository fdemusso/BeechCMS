[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / schemaAudit

# Function: schemaAudit()

> **schemaAudit**(`args?`): `Promise`&lt;`void`&gt;

Reports relation branches whose physical storage (FK column, `rel_<slug>_<alias>` junction, FK
policy) no longer matches the deployed definition, typically left behind by seed edits made
before the additive relation gate.

Read-only: nothing is written or repaired and stranded rows are never deleted. Exits non-zero
when any mismatch exists, so CI or an operator can gate on it.

## Parameters

### args?

[`SchemaAuditOptions`](../interfaces/SchemaAuditOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
