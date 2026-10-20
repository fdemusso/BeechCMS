[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / TagValueResult

# Type Alias: TagValueResult

> **TagValueResult** = \{ `ok`: `true`; `value`: `string`; \} \| \{ `ok`: `false`; `reason`: [`TagValueRejection`](TagValueRejection.md); \}

Outcome of [normalizeTagValue](../functions/normalizeTagValue.md): the canonical value (possibly `''`), or why it was rejected.
