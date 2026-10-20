[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / schemaDiff

# Function: schemaDiff()

> **schemaDiff**(`args?`): `Promise`&lt;`void`&gt;

Reports schema drift on two independent axes:

 1. MANIFEST vs DEPLOYED DEFINITIONS — "is my snapshot stale, or does my authored manifest
    disagree with what is deployed?" Skipped when no manifest file exists.
 2. DEPLOYED DEFINITIONS vs PHYSICAL TABLES — "does `content_{slug}` actually match the
    definition the engine believes?" This is a fault report: the engine applies DDL on save, so
    divergence here means a failed or partial apply, not an authoring choice.

Exits non-zero when either axis reports drift, so CI can gate on it. Nothing is written and no
DDL is emitted — reconciliation is `beech schema plan` / `beech schema apply`.

## Parameters

### args?

[`SchemaDiffOptions`](../interfaces/SchemaDiffOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
