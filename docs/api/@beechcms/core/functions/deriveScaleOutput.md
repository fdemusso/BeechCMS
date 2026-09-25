[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / deriveScaleOutput

# Function: deriveScaleOutput()

> **deriveScaleOutput**(`presetWidth`, `source`, `maxDimension`): [`MediaDimensions`](../interfaces/MediaDimensions.md) \| `null`

Output dimensions of a scale preset (`fit=scale-down`: never upscales). Returns `null` when either
side would exceed `maxDimension` — the pathological-aspect-ratio guard of brief §4. Never truncates.

## Parameters

### presetWidth

`number`

### source

[`MediaDimensions`](../interfaces/MediaDimensions.md)

### maxDimension

`number`

## Returns

[`MediaDimensions`](../interfaces/MediaDimensions.md) \| `null`
