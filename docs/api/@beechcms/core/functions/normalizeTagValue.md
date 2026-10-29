[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / normalizeTagValue

# Function: normalizeTagValue()

> **normalizeTagValue**(`raw`): [`TagValueResult`](../type-aliases/TagValueResult.md)

Canonical form of one tag, the single rule shared by payload validation, seed option validation and filters:
invisible and control characters removed (an emoji-gluing joiner survives), every whitespace run (tab, newline,
NBSP, line separator…) collapsed to one space, trimmed, Unicode NFC. Case is preserved (`Foo` ≠ `foo`).

`ok: true` with `''` means the tag was blank after cleaning: callers decide whether to drop or reject it.
Rejected, never repaired: a lone UTF-16 surrogate (not valid UTF-8) and a value over
[TAG\_MAX\_LENGTH](../variables/TAG_MAX_LENGTH.md) characters or [TAG\_MAX\_BYTES](../variables/TAG_MAX_BYTES.md) bytes. Pure, never throws.

## Parameters

### raw

`string`

## Returns

[`TagValueResult`](../type-aliases/TagValueResult.md)
