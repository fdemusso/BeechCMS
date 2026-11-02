[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / CsvEncodeOptions

# Interface: CsvEncodeOptions

## Properties

### neutralizeFormulas?

> `optional` **neutralizeFormulas?**: `boolean`

Prefixes `'` to cells a spreadsheet would evaluate as a formula. Off by default: the
prefix is read back as data by `CsvRowReader`, so a neutralized file is a one-way,
human-facing export and must not be the default (it would break the import round-trip).
