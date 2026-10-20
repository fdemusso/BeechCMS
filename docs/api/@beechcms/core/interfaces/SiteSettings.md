[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SiteSettings

# Interface: SiteSettings

## Properties

### companyAbbreviation

> **companyAbbreviation**: `string` \| `null`

***

### companyName

> **companyName**: `string` \| `null`

***

### companyWebsite

> **companyWebsite**: `string` \| `null`

***

### currency

> **currency**: `string`

***

### defaultLanguage

> **defaultLanguage**: `string`

***

### defaultLocale

> **defaultLocale**: `string` \| `null`

Default content locale. `null` = never configured.

***

### locales

> **locales**: `string`[] \| `null`

Content locales for field-level localization, in display order. `null` = never configured
(resolveLocaleConfig then falls back to `[defaultLanguage]`). Distinct from `defaultLanguage`,
which is the dashboard UI language.

***

### siteTitle

> **siteTitle**: `string`

***

### timezone

> **timezone**: `string`
