[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / validateCardConfigAgainstSeed

# Function: validateCardConfigAgainstSeed()

> **validateCardConfigAgainstSeed**(`config`, `seed`): [`ValidateCardConfigResult`](../type-aliases/ValidateCardConfigResult.md)

## Parameters

### config

#### header?

\{ `branchId`: `string`; \} \| `null` = `...`

Full-width primary line. Max 1.

#### media?

\{ `branchId`: `string`; \} \| `null` = `...`

Optional media/avatar slot. Full width. Max 1.

#### metadata

`object`[] = `...`

2-column grid. Hard cap enforced by validator (see METADATA_SLOT_CAP).

#### subtitle?

\{ `branchId`: `string`; \} \| `null` = `...`

Full-width secondary line. Max 1.

#### version

`1` = `...`

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

[`ValidateCardConfigResult`](../type-aliases/ValidateCardConfigResult.md)
