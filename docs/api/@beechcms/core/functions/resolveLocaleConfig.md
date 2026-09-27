[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveLocaleConfig

# Function: resolveLocaleConfig()

> **resolveLocaleConfig**(`settings`): [`LocaleConfig`](../interfaces/LocaleConfig.md)

Builds the project's [LocaleConfig](../interfaces/LocaleConfig.md), repairing whatever a hand-edited settings row could break so
the LocaleConfig invariant always holds:
- `locales`: the stored list minus invalid codes and duplicates; when nothing remains (never configured,
  `[]`, corrupt), the implicit single-language config `[defaultLanguage]` (brief §2), which keeps the
  feature invisible to a mono-lingual project;
- `defaultLocale`: the stored value when it belongs to `locales`, else `locales[0]`.

## Parameters

### settings

[`LocaleSettings`](../interfaces/LocaleSettings.md)

## Returns

[`LocaleConfig`](../interfaces/LocaleConfig.md)
