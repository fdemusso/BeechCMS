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

### fallback?

> `optional` **fallback?**: `true`

True on the null column of a required axis. No valid entry belongs there: it only collects entries
whose value is missing or no longer an option, so none disappears from the board. The board shows it
only while it holds entries and never moves or creates an entry into it.

***

### label

> **label**: `string`

***

### value

> **value**: `string` \| `null`

The discrete axis value. `null` ⇒ the always-last "Senza valore" column.
