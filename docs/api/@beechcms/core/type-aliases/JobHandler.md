[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / JobHandler

# Type Alias: JobHandler&lt;T&gt;

> **JobHandler**&lt;`T`&gt; = (`payload`, `context`) => `Promise`&lt;`void`&gt;

A single background worker. Receives the decoded payload + context.

## Type Parameters

### T

`T` = `unknown`

## Parameters

### payload

`T`

### context

[`JobContext`](../interfaces/JobContext.md)

## Returns

`Promise`&lt;`void`&gt;
