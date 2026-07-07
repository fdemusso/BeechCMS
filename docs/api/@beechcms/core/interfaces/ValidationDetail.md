[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ValidationDetail

# Interface: ValidationDetail

Represents a single validation error detail returned when a seed payload field fails validation.

## Properties

### expected

> **expected**: `string`

The expected type, format, or constraint (e.g., `'string'`, `'number(min:1)'`, `'required-field'`).

***

### field

> **field**: `string`

The name of the alias or field that failed validation.

***

### message

> **message**: `string`

A human-readable error message explaining why validation failed.

***

### received

> **received**: `string`

The type or status of the value actually received (e.g., `'null'`, `'array'`, `'missing'`).
