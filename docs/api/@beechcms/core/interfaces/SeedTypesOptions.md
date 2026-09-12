[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SeedTypesOptions

# Interface: SeedTypesOptions

Options that affect the emitted module beyond the seed interfaces themselves.

## Properties

### fingerprint?

> `optional` **fingerprint?**: `string`

Schema fingerprint to embed as `SCHEMA_FINGERPRINT`, from `computeSchemaFingerprint`.
Omitted ⇒ no constant is emitted and the output is byte-identical to a pre-fingerprint build,
which is what keeps the legacy `beech gen-types` aliases non-breaking.
