[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / KanbanMoveBody

# Interface: KanbanMoveBody

Body of PATCH /:slug/:id/kanban-move. The server applies the axis change (if any)
 AND the position upsert atomically (KB-S04e).

## Properties

### axis?

> `optional` **axis?**: `object`

Present only on a cross-column move: the destination column value (`null` = "Senza valore").

#### value

> **value**: `string` \| `null`

***

### axisBranchId

> **axisBranchId**: `string`

Axis branch id (br_XX). Identifies which kanban_positions row + which branch to patch.

***

### position

> **position**: `string`

New fractional-index key for this entry in the destination column (KB-S04b/d).
