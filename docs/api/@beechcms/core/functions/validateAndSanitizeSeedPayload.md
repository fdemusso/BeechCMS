[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / validateAndSanitizeSeedPayload

# Function: validateAndSanitizeSeedPayload()

> **validateAndSanitizeSeedPayload**(`seed`, `payload`, `options?`): [`ValidateSeedPayloadResult`](../interfaces/ValidateSeedPayloadResult.md)

Validates and sanitizes a seed payload against its schema definition.

This is the public entry point for seed payload validation. It strips unknown
aliases, coerces types, checks required fields on create/update, checks limits,
and performs rich text XSS checks without throwing exceptions.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed definition containing field/branch definitions.

### payload

`Record`&lt;`string`, `unknown`&gt;

The raw payload values to validate and sanitize.

### options?

[`ValidateSeedPayloadOptions`](../interfaces/ValidateSeedPayloadOptions.md) = `{}`

Validation settings to override defaults.

## Returns

[`ValidateSeedPayloadResult`](../interfaces/ValidateSeedPayloadResult.md)

A structured validation result containing parsed data, details of any issues, and flags.
