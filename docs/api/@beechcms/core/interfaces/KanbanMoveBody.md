[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / KanbanMoveBody

# Interface: KanbanMoveBody

Body of PATCH /:slug/:id/kanban-move. The server applies the axis change (if any)
 AND the position upsert atomically (KB-S04e).

## Properties

### axis?

> `optional` **axis?**: \{ `kind`: `"scalar"`; `value`: `string` \| `null`; \} \| \{ `kind`: `"tags"`; `newValue`: `string` \| `null`; `oldValue`: `string` \| `null`; \}

Present only on a cross-column move (axis value changed). Omit for same-column reorder.

***

### axisBranchId

> **axisBranchId**: `string`

Axis branch id (br_XX). Identifies which kanban_positions row + which branch to patch.

***

### position

> **position**: `string`

New fractional-index key for this entry in the destination column (KB-S04b/d).
