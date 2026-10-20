[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / applyLocalizedPatch

# Function: applyLocalizedPatch()

> **applyLocalizedPatch**(`branch`, `stored`, `write`, `config`): [`LocalizedDictionary`](../type-aliases/LocalizedDictionary.md) \| `null`

Merges a write into the value stored for a localized branch. The write path's only way to persist a
localized value, so a translation the write does not mention is never dropped (brief §2):
- `write === null` clears the whole field (an explicit null keeps its pre-localization meaning);
- otherwise the write is normalised with [toLocalizedPatch](toLocalizedPatch.md): every registered locale it names
  overwrites that locale, a `null` entry clears that locale only, and every other stored locale —
  including ones no longer registered — is kept as-is;
- a stored legacy value (written before the branch became localized) is the default-locale value.

## Parameters

### branch

`Pick`&lt;[`Branch`](../interfaces/Branch.md), `"type"` \| `"localized"`&gt;

### stored

`unknown`

### write

`unknown`

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md)

## Returns

[`LocalizedDictionary`](../type-aliases/LocalizedDictionary.md) \| `null`

The compacted dictionary, or `null` when no locale keeps a value.
