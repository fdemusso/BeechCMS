[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveLocalizedValue

# Function: resolveLocalizedValue()

> **resolveLocalizedValue**(`branch`, `value`, `locale`, `config`): `unknown`

Resolves a stored localized value to one language: the requested locale, then the default locale, then the
first stored translation (stored key order), then `null`. A legacy value that is not a dictionary is returned
as-is. Non-localized branches return `value` unchanged. `buildSelectQuery` applies the same chain in SQL, so
filters and ORDER BY compare exactly what a reader sees.

## Parameters

### branch

`Pick`&lt;[`Branch`](../interfaces/Branch.md), `"type"` \| `"localized"`&gt;

### value

`unknown`

### locale

`string`

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md)

## Returns

`unknown`
