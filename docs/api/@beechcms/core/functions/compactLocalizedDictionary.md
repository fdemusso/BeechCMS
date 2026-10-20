[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / compactLocalizedDictionary

# Function: compactLocalizedDictionary()

> **compactLocalizedDictionary**(`value`): [`LocalizedDictionary`](../type-aliases/LocalizedDictionary.md) \| `null`

Removes `null` / `undefined` / blank-string entries. Returns `null` when nothing remains, so an
all-cleared dictionary is stored as SQL NULL rather than `{}`. Keys are otherwise preserved as-is —
including locales no longer registered, which must never be dropped by a write (brief §2, no data loss).

## Parameters

### value

[`LocalizedDictionary`](../type-aliases/LocalizedDictionary.md)

## Returns

[`LocalizedDictionary`](../type-aliases/LocalizedDictionary.md) \| `null`
