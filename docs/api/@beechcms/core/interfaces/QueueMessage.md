[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / QueueMessage

# Interface: QueueMessage&lt;T&gt;

The envelope put on the wire / queue. `name` selects the handler from the
JobRegistry; `payload` is the developer-supplied, JSON-serializable body.

## Type Parameters

### T

`T` = `unknown`

## Properties

### name

> **name**: `string`

***

### payload

> **payload**: `T`
