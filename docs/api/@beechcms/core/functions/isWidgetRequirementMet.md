[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / isWidgetRequirementMet

# Function: isWidgetRequirementMet()

> **isWidgetRequirementMet**(`requirement`, `permissions`, `config`): `boolean`

Whether `permissions` satisfies `requirement` for a widget carrying `config`.
Cosmetic gate only: the widget's data routes remain the enforcement point. Never throws.

## Parameters

### requirement

[`WidgetRequirement`](../type-aliases/WidgetRequirement.md) \| `undefined`

### permissions

[`EffectivePermissions`](../interfaces/EffectivePermissions.md)

### config

`Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt;

## Returns

`boolean`
