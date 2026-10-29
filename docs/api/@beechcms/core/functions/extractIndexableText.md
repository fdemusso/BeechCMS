[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / extractIndexableText

# Function: extractIndexableText()

> **extractIndexableText**(`seed`, `entry`): `string` \| `null`

Extracts and concatenates text from all public indexable text/richtext branches of a seed.
Enforces privacy policies by utilizing indexableSearchBranches.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition.

### entry

`Record`&lt;`string`, `any`&gt;

The content entry record.

## Returns

`string` \| `null`

The combined text, or null if no indexable text exists.
