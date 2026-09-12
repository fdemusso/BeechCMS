[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / computeSchemaFingerprint

# Function: computeSchemaFingerprint()

> **computeSchemaFingerprint**(`seeds`): `Promise`&lt;`string`&gt;

`v{VERSION}:{32 lowercase hex}` — SHA-256 over the canonical JSON of the contract projection,
truncated to 128 bits.

Truncation is deliberate: this value travels on EVERY public response as `X-Schema-Revision`,
and 128 bits of a SHA-256 digest carries no realistic collision risk for a value space of a few
hundred schema revisions. It is a revision marker, never a security token.

Web Crypto only — the same API the Worker and Node ≥ 18 both expose, as `webhook-crypto.ts`
already relies on. `@beechcms/core` gains no dependency.

## Parameters

### seeds

[`Seed`](../interfaces/Seed.md)[]

## Returns

`Promise`&lt;`string`&gt;
