[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / DashboardWidgetInstance

# Interface: DashboardWidgetInstance

A placed widget. `type` is namespaced ('core/stat', '@acme/weather').
 `config` is opaque to core/API except for the optional `seedSlug` key,
 which enables auto-cleanup when the referenced seed disappears.

## Properties

### config

> **config**: `Record`&lt;`string`, `unknown`&gt;

***

### id

> **id**: `string`

***

### title?

> `optional` **title?**: `string`

***

### type

> **type**: `string`
