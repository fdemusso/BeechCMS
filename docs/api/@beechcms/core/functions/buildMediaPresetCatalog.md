[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / buildMediaPresetCatalog

# Function: buildMediaPresetCatalog()

> **buildMediaPresetCatalog**(`overrides`, `maxDimension`): [`MediaPresetCatalog`](../type-aliases/MediaPresetCatalog.md)

Builds the active catalog: DEFAULT_MEDIA_PRESETS merged by name with `overrides`
(the parsed MEDIA_PRESETS JSON). An override value of `null` removes a preset.
Defaults larger than `maxDimension` are dropped (they could only ever 400); an operator-supplied
preset larger than `maxDimension` is an error.

## Parameters

### overrides

`unknown`

### maxDimension

`number`

## Returns

[`MediaPresetCatalog`](../type-aliases/MediaPresetCatalog.md)

## Throws

on any malformed override.
