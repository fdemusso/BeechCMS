[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / parseStoredUiPreferences

# Function: parseStoredUiPreferences()

> **parseStoredUiPreferences**(`stored`): [`UiPreferences`](../type-aliases/UiPreferences.md)

Reads a stored `users.ui_prefs` value. Anything that is not valid JSON or not a valid container
yields `EMPTY_UI_PREFERENCES`; never throws.

## Parameters

### stored

`string`

## Returns

[`UiPreferences`](../type-aliases/UiPreferences.md)
