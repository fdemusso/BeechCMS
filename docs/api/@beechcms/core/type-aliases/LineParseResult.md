[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / LineParseResult

# Type Alias: LineParseResult

> **LineParseResult** = \{ `ok`: `true`; `record`: [`TransferRecord`](TransferRecord.md); \} \| \{ `code`: [`LineParseErrorCode`](LineParseErrorCode.md); `message`: `string`; `ok`: `false`; \}

Per-line decode outcome. Import is best-effort (brief §2), so a bad line is a VALUE,
never a thrown error — the consumer must record it in the job report and keep going.
