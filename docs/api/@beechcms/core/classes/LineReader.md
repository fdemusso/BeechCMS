[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LineReader

# Class: LineReader

Splits an arbitrarily-chunked text stream into complete lines, holding the trailing
partial line until the next chunk completes it. Stateful by necessity: a single
R2 read boundary may fall in the middle of a record, and an import that lost that
record would report a phantom failed row.

Blank lines are dropped — a trailing newline at end of file is not a record.

## Constructors

### Constructor

> **new LineReader**(): `LineReader`

#### Returns

`LineReader`

## Methods

### end()

> **end**(): `string`[]

Flushes the trailing line of a file that does not end in a newline.

#### Returns

`string`[]

***

### push()

> **push**(`chunk`): `string`[]

Feeds a chunk and returns every line completed by it.

#### Parameters

##### chunk

`string`

#### Returns

`string`[]
