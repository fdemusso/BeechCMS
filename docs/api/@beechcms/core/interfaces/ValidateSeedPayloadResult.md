[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ValidateSeedPayloadResult

# Interface: ValidateSeedPayloadResult

The structured result returned by the seed payload validation process.

## Properties

### dangerousFields

> **dangerousFields**: `string`[]

List of fields containing potentially dangerous rich text content (e.g. XSS vectors).

***

### data

> **data**: `Record`&lt;`string`, `unknown`&gt;

The successfully validated and sanitized fields.
Only contains valid fields that matched the seed branches.

***

### details

> **details**: [`ValidationDetail`](ValidationDetail.md)[]

Detailed information about all validation errors or unrecognized fields.

***

### hasAnyValidField

> **hasAnyValidField**: `boolean`

Flag indicating if the validated data payload contains at least one valid field.

***

### requiredFieldsMissing

> **requiredFieldsMissing**: `string`[]

List of required fields that were missing or effectively empty.

***

### unknownAliases

> **unknownAliases**: `string`[]

List of field aliases that were present in the payload but are not defined in the seed.
