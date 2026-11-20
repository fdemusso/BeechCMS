[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / uiPreferencesSchema

# Variable: uiPreferencesSchema

> `const` **uiPreferencesSchema**: `z.ZodType`&lt;[`UiPreferences`](../type-aliases/UiPreferences.md), [`UiPreferencesInput`](../type-aliases/UiPreferencesInput.md)&gt;

The per-user UI preferences container (`users.ui_prefs`). Closed keys: an unknown key is refused.
A key left out takes its default, so a PUT body replaces the whole container.
