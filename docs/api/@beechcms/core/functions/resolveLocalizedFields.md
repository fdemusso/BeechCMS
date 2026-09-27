[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveLocalizedFields

# Function: resolveLocalizedFields()

> **resolveLocalizedFields**(`seed`, `data`, `config`, `locale?`): `Record`&lt;`string`, `unknown`&gt;

Returns a copy of `data` with every localized branch resolved to `locale` (default: the default locale)
via [resolveLocalizedValue](resolveLocalizedValue.md). Returns `data` itself when `config` is undefined.

## Parameters

### seed

`Pick`&lt;[`Seed`](../interfaces/Seed.md), `"branches"`&gt;

### data

`Record`&lt;`string`, `unknown`&gt;

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md) \| `undefined`

### locale?

`string`

## Returns

`Record`&lt;`string`, `unknown`&gt;
