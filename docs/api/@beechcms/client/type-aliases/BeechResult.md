[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/client](../README.md) / BeechResult

# Type Alias: BeechResult&lt;T&gt;

> **BeechResult**&lt;`T`&gt; = \{ `data`: `T`; `error`: `null`; \} \| \{ `data`: `null`; `error`: [`BeechProblem`](../interfaces/BeechProblem.md); \}

Discriminated result — the client NEVER throws on HTTP/validation errors.

## Type Parameters

### T

`T`
