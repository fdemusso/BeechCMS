[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / mergeContentViewOrder

# Function: mergeContentViewOrder()

> **mergeContentViewOrder**(`allIds`, `visibleOrder`): `string`[]

The full position order of a seed's rows after its visible views were reordered. Hidden rows
(types the allow-list currently rejects) keep their slot; visible slots are refilled in the
requested order. Writing the result compacts positions to 0..n-1 with no duplicates.

## Parameters

### allIds

readonly `string`[]

### visibleOrder

readonly `string`[]

## Returns

`string`[]
