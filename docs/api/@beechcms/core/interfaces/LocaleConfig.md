[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LocaleConfig

# Interface: LocaleConfig

Project-level language configuration. Invariant (guaranteed by its producer): `locales` is non-empty,
every entry matches [LOCALE\_CODE\_RE](../variables/LOCALE_CODE_RE.md), and it contains `defaultLocale`.

## Properties

### defaultLocale

> `readonly` **defaultLocale**: `string`

***

### locales

> `readonly` **locales**: readonly `string`[]
