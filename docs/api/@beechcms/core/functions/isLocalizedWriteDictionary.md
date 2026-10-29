[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isLocalizedWriteDictionary

# Function: isLocalizedWriteDictionary()

> **isLocalizedWriteDictionary**(`value`, `config`): `value is LocalizedDictionary`

Stricter check used on WRITE paths: a locale dictionary with at least one REGISTERED locale key.
Without the registration requirement a legitimate json value such as `{"url": "…", "alt": "…"}` —
whose keys happen to match the grammar — would be read as a dictionary of unregistered locales and
silently emptied.

## Parameters

### value

`unknown`

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md)

## Returns

`value is LocalizedDictionary`
