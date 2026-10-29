[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / verifyPkceChallenge

# Function: verifyPkceChallenge()

> **verifyPkceChallenge**(`verifier`, `challenge`, `method`): `Promise`&lt;`boolean`&gt;

Verifies a code_verifier against a stored code_challenge.
Returns false — never throws — on any malformed input, unsupported method, or
mismatch, so callers cannot distinguish failure modes from the return value.

## Parameters

### verifier

`string`

### challenge

`string`

### method

`string`

## Returns

`Promise`&lt;`boolean`&gt;
