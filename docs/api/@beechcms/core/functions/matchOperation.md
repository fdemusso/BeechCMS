[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / matchOperation

# Function: matchOperation()

> **matchOperation**(`method`, `path`): [`OperationSpec`](../type-aliases/OperationSpec.md) \| `null`

Finds the catalogued operation a request addresses.

## Parameters

### method

`string`

Upper-case HTTP method; anything outside `GET|POST|PUT|PATCH|DELETE` misses.

### path

`string`

Request pathname (`c.req.path`), without query string. One trailing slash is ignored.

## Returns

[`OperationSpec`](../type-aliases/OperationSpec.md) \| `null`

The most specific matching operation (literal segments beat parameters), or `null`
  on any miss. Fail-closed: a miss is never upgraded to a guess. Never throws.
