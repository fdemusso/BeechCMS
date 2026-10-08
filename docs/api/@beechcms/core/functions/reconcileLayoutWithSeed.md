[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / reconcileLayoutWithSeed

# Function: reconcileLayoutWithSeed()

> **reconcileLayoutWithSeed**(`layout`, `seed`): [`FormLayout`](../interfaces/FormLayout.md)

Makes a stored layout safe to serve after the Seed changed. A layout that breaks the
full-width rules falls back to the generated default; otherwise layoutable branches the
layout never placed (added to the Seed later) are appended as trailing sections of the
first tab, so the editor can always render and fill them.

## Parameters

### layout

[`FormLayout`](../interfaces/FormLayout.md)

### seed

[`Seed`](../interfaces/Seed.md)

## Returns

[`FormLayout`](../interfaces/FormLayout.md)
