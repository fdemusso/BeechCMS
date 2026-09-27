[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / asLocaleDictionaries

# Function: asLocaleDictionaries()

> **asLocaleDictionaries**(`seed`, `data`, `config`): `Record`&lt;`string`, `unknown`&gt;

Returns a copy of `data` with every localized branch it carries passed through [asLocaleDictionary](asLocaleDictionary.md).

## Parameters

### seed

`Pick`&lt;[`Seed`](../interfaces/Seed.md), `"branches"`&gt;

### data

`Record`&lt;`string`, `unknown`&gt;

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md)

## Returns

`Record`&lt;`string`, `unknown`&gt;
