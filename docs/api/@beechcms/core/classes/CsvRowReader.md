[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / CsvRowReader

# Class: CsvRowReader

Splits an arbitrarily-chunked CSV text stream into rows of cells.

Stateful and quote-aware: a newline inside a quoted field is DATA, not a row break, so
a naive `split('\n')` corrupts any export containing a multi-line text branch — which
the export side of this same module is perfectly capable of producing. The parser
therefore carries its in-quotes state across chunk boundaries as well as across lines.

## Constructors

### Constructor

> **new CsvRowReader**(): `CsvRowReader`

#### Returns

`CsvRowReader`

## Methods

### end()

> **end**(): `string`[][]

Flushes the final row of a file with no trailing newline.

#### Returns

`string`[][]

#### Throws

never — an unterminated quote is reported by `hasUnterminatedQuote()` so the
  caller can record it as a failed row rather than losing the whole chunk.

***

### hasUnterminatedQuote()

> **hasUnterminatedQuote**(): `boolean`

True when `end()` was reached inside an open quoted field — the file is truncated.

#### Returns

`boolean`

***

### push()

> **push**(`chunk`): `string`[][]

Feeds a chunk and returns every row completed by it.

#### Parameters

##### chunk

`string`

#### Returns

`string`[][]
