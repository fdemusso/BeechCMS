[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / mergeLocalizedFields

# Function: mergeLocalizedFields()

> **mergeLocalizedFields**(`seed`, `stored`, `data`, `config`): `Record`&lt;`string`, `unknown`&gt;

Returns `data` with every localized branch it carries merged into `stored` via
[applyLocalizedPatch](applyLocalizedPatch.md); other keys pass through untouched. `stored` is the entry's current values
(`null` on create, which only compacts). Returns `data` itself when `config` is undefined or no localized
branch is written.

## Parameters

### seed

`Pick`&lt;[`Seed`](../interfaces/Seed.md), `"branches"`&gt;

### stored

`Record`&lt;`string`, `unknown`&gt; \| `null`

### data

`Record`&lt;`string`, `unknown`&gt;

### config

[`LocaleConfig`](../interfaces/LocaleConfig.md) \| `undefined`

## Returns

`Record`&lt;`string`, `unknown`&gt;
