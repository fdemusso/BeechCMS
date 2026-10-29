[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isLocaleDictionary

# Function: isLocaleDictionary()

> **isLocaleDictionary**(`value`): `value is LocalizedDictionary`

Structural check used on READ paths (no config available): a non-empty plain object whose every key
matches the locale-code grammar. A richtext envelope (`schemaVersion`, `doc`) and a TipTap doc
(`type`, `content`) never match.

## Parameters

### value

`unknown`

## Returns

`value is LocalizedDictionary`
