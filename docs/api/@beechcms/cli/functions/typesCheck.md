[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/cli](../index.md) / typesCheck

# Function: typesCheck()

> **typesCheck**(`args?`): `Promise`&lt;`void`&gt;

CI guard for `beech.generated.ts` drift (#425): regenerates types from live D1 in memory and
diffs against the committed file, without writing anything on a clean run.

This closes the gap `beech types generate` leaves open — nothing in the dispatcher previously
failed a build when someone applied a schema change and forgot to regenerate. Exits 1 when the
file is missing or stale, mirroring `beech schema diff`'s exit convention so both can gate CI.

## Parameters

### args?

[`TypesCheckOptions`](../interfaces/TypesCheckOptions.md) = `{}`

## Returns

`Promise`&lt;`void`&gt;
