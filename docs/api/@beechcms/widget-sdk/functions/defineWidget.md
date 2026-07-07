[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/widget-sdk](../index.md) / defineWidget

# Function: defineWidget()

> **defineWidget**&lt;`TConfig`&gt;(`definition`): [`WidgetDefinition`](../interfaces/WidgetDefinition.md)&lt;`TConfig`&gt;

Identity helper that gives widget authors full type inference for
`defineWidget<TConfig>(...)` while validating the widget `type`.

- `type` must match [WIDGET\_TYPE\_REGEX](../../core/variables/WIDGET_TYPE_REGEX.md).
- The `core/` prefix is reserved for built-in widgets and is rejected.

## Type Parameters

### TConfig

`TConfig`

## Parameters

### definition

[`WidgetDefinition`](../interfaces/WidgetDefinition.md)&lt;`TConfig`&gt;

## Returns

[`WidgetDefinition`](../interfaces/WidgetDefinition.md)&lt;`TConfig`&gt;
