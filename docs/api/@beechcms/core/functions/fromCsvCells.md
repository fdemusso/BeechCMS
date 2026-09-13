[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / fromCsvCells

# Function: fromCsvCells()

> **fromCsvCells**(`columns`, `cells`): [`LineParseResult`](../type-aliases/LineParseResult.md)

Rebuilds a record from a CSV row. An empty cell is treated as ABSENT, not as null:
CSV cannot distinguish the two, and omitting the key lets the engine's own
required-field validation produce the error instead of this module guessing.

## Parameters

### columns

`string`[]

### cells

`string`[]

## Returns

[`LineParseResult`](../type-aliases/LineParseResult.md)
