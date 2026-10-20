[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / parseNdjsonLine

# Function: parseNdjsonLine()

> **parseNdjsonLine**(`line`): [`LineParseResult`](../type-aliases/LineParseResult.md)

Decodes one NDJSON line. Never throws: a malformed line is a failed row in the job
report, not an aborted import (brief §2 — best-effort, not atomic).

## Parameters

### line

`string`

## Returns

[`LineParseResult`](../type-aliases/LineParseResult.md)
