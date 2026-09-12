[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / projectSchemaContract

# Function: projectSchemaContract()

> **projectSchemaContract**(`seeds`): [`SchemaContract`](../interfaces/SchemaContract.md)

Reduces seeds to what a response shape depends on.

Deliberately EXCLUDED, and each for a reason a future reader must not "fix":
- `id` (`br_XX`) — a stable internal handle; it never appears in a payload, and minting order
  differs between an environment built by migration and one grown through the dashboard.
- `label`, `labelPlural`, `hint`, `dashboard`, `layout` — presentation, never response shape.
- `retentionDays`, `onDelete`, `policies.search|filter|sort`, `numberOptions`, `fileOptions`,
  `policies.classification|privacy` — behaviour and storage concerns that leave the response
  shape identical. (`privacy` DOES change a stored value's encoding, but the API type stays
  `string`; drift there is a data concern, not a type concern.)
- anything physical (column order, index names) — see the VETO Audit.

Seeds are sorted by slug; BRANCH ORDER IS PRESERVED, because it is the declared field order the
generated types and the dashboard form both follow.

## Parameters

### seeds

[`Seed`](../interfaces/Seed.md)[]

## Returns

[`SchemaContract`](../interfaces/SchemaContract.md)
