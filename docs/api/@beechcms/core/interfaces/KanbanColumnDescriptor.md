[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / KanbanColumnDescriptor

# Interface: KanbanColumnDescriptor

A single column on the board, in deterministic display order (Q2).

## Properties

### color?

> `optional` **color?**: `string`

The option color (#RRGGBB) of a tags-axis column. Absent on boolean columns and on the null column.

***

### label

> **label**: `string`

***

### value

> **value**: `string` \| `null`

The discrete axis value. `null` ⇒ the always-last "Senza valore" column.
