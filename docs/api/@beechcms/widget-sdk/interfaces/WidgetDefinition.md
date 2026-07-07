[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/widget-sdk](../README.md) / WidgetDefinition

# Interface: WidgetDefinition&lt;TConfig&gt;

Describes a widget type that can be placed on the dashboard.

## Type Parameters

### TConfig

`TConfig` = `unknown`

## Properties

### category

> **category**: `"stats"` \| `"charts"` \| `"content"` \| `"system"` \| `"custom"`

***

### component

> **component**: `ComponentType`&lt;[`DashboardWidgetProps`](DashboardWidgetProps.md)&lt;`TConfig`&gt;&gt;

***

### ConfigPanel?

> `optional` **ConfigPanel?**: `ComponentType`&lt;\{ `config`: `TConfig`; `onChange`: (`next`) => `void`; \}&gt;

Builder hint: config panel. Absent = "no options" notice.

***

### configSchema

> **configSchema**: `ZodType`&lt;`TConfig`&gt;

Schema with `.catch()`/`.optional()` so partial configs always parse.

***

### defaultConfig

> **defaultConfig**: `TConfig`

***

### descriptionKey?

> `optional` **descriptionKey?**: `string`

***

### icon?

> `optional` **icon?**: `string`

Lucide icon name for the picker.

***

### labelKey

> **labelKey**: `string`

i18n key for the picker (built-ins); plain string allowed (custom).

***

### minColumnSpan?

> `optional` **minColumnSpan?**: `number`

Builder hint: minimum sensible column span out of 12.

***

### type

> **type**: `string`

Namespaced type: `core/<name>` for built-ins, npm name for custom.
