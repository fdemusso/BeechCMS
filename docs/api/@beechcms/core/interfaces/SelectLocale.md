[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SelectLocale

# Interface: SelectLocale

The language a read resolves localized branches to (consumed by `buildSelectQuery`).

## Properties

### code

> `readonly` **code**: `string`

Locale that filters and ORDER BY compare in. Must match `LOCALE_CODE_RE`; the builder throws otherwise.

***

### config

> `readonly` **config**: [`LocaleConfig`](LocaleConfig.md)
