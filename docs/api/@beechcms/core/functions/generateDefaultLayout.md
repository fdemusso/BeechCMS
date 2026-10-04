[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / generateDefaultLayout

# Function: generateDefaultLayout()

> **generateDefaultLayout**(`seed`, `opts?`): [`FormLayout`](../interfaces/FormLayout.md)

Builds the default editor layout for a Seed with no custom `layout`: full-width branches
(richtext, json, galleries) each get their own dedicated section, the remaining branches are
packed three per section in seed order, and a single main non-gallery image file branch
(`fileOptions.accept === 'image'`) leads the Data tab alone in its own full-width section.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

### opts?

#### newId

() => `string`

## Returns

[`FormLayout`](../interfaces/FormLayout.md)
