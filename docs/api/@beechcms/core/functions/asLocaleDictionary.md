[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / asLocaleDictionary

# Function: asLocaleDictionary()

> **asLocaleDictionary**(`branch`, `value`, `config`): `unknown`

The whole dictionary of a stored localized value, for readers asking every language (`?lang=all`):
a stored dictionary as-is — unregistered locales included, nothing is hidden (brief §2) — a legacy
value as `{ [defaultLocale]: value }` (the write path's reading of it), a blank value as `null`.
Non-localized branches return `value` unchanged.

## Parameters

### branch

`Pick`&lt;[`Branch`](../interfaces/Branch.md), `"type"` \| `"localized"`&gt;

### value

`unknown`

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md)

## Returns

`unknown`
