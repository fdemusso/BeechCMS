[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / toLocalizedPatch

# Function: toLocalizedPatch()

> **toLocalizedPatch**(`value`, `config`): [`LocalizedPatch`](../type-aliases/LocalizedPatch.md)

Normalises any accepted write value of a localized branch into a [LocalizedPatch](../type-aliases/LocalizedPatch.md):
- a write dictionary keeps its registered locales, in `config.locales` order; unregistered locale
  keys are dropped;
- any other value (string, richtext doc, non-dictionary json) is the default-locale value;
- `null`, `undefined` and blank strings become `null` ("clear this locale").
Idempotent: a patch passed back in yields the same patch.

## Parameters

### value

`unknown`

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md)

## Returns

[`LocalizedPatch`](../type-aliases/LocalizedPatch.md)
