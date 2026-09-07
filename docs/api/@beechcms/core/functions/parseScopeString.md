[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / parseScopeString

# Function: parseScopeString()

> **parseScopeString**(`raw`): (`"schema:read"` \| `"schema:write"`)[] \| `null`

Parses an RFC 6749 §3.3 space-delimited scope string.
Returns null if the string is empty or contains any unknown scope — callers
must reject the request with `invalid_scope` rather than silently dropping it.
Duplicates are collapsed; order is not significant.

## Parameters

### raw

`string`

## Returns

(`"schema:read"` \| `"schema:write"`)[] \| `null`
