[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / TagOption

# Interface: TagOption

One entry of a `tags` branch's closed vocabulary. Array order is significant (menu, kanban columns, sort).

## Properties

### color

> **color**: `string`

Presentation-only color, `#RRGGBB`. Lives in the seed only — never persisted in entries.

***

### value

> **value**: `string`

Stored value and identity. Unique within the branch; compared exactly (case-sensitive, never trimmed).
