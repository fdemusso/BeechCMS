[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / mediaPresetSignature

# Function: mediaPresetSignature()

> **mediaPresetSignature**(`preset`, `maxDimension`): `string`

Identity of a preset's *definition*, so redefining a name never reuses an old variant.
A scale preset's validity depends on the effective dimension ceiling (its height derives from the
source), so the ceiling is part of its identity; a crop preset is validated at catalog build.

## Parameters

### preset

[`MediaPreset`](../type-aliases/MediaPreset.md)

### maxDimension

`number`

## Returns

`string`
