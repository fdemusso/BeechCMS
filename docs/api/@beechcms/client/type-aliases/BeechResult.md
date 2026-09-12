[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / BeechResult

# Type Alias: BeechResult&lt;T&gt;

> **BeechResult**&lt;`T`&gt; = \{ `data`: `T`; `error`: `null`; `headers?`: `Headers`; \} \| \{ `data`: `null`; `error`: [`BeechProblem`](../interfaces/BeechProblem.md); `headers?`: `Headers`; \}

Discriminated result — the client NEVER throws on HTTP/validation errors.

## Type Parameters

### T

`T`
