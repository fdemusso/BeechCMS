[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateSeedTypes

# Function: generateSeedTypes()

> **generateSeedTypes**(`seeds`, `options?`): `string`

Pure entry point. Deterministic: sorts seeds by slug for stable diffs.

The embedded fingerprint is the client's half of the drift check: `@beechcms/client` compares it
against the `X-Schema-Revision` header the API returns and raises an actionable error on a
mismatch, instead of trusting a stale response shape.

## Parameters

### seeds

[`Seed`](../interfaces/Seed.md)[]

### options?

[`SeedTypesOptions`](../interfaces/SeedTypesOptions.md) = `{}`

## Returns

`string`
