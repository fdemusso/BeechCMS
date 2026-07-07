[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ITokenService

# Interface: ITokenService

## Methods

### issue()

> **issue**(`claims`, `options?`): `Promise`&lt;`string`&gt;

Issues a signed JWT for the given claims. The token is short-lived by design;
callers that need a longer-lived session should use a refresh token instead.

#### Parameters

##### claims

[`JwtClaims`](JwtClaims.md)

##### options?

[`IssueTokenOptions`](IssueTokenOptions.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### verify()

> **verify**(`token`): `Promise`&lt;[`JwtClaims`](JwtClaims.md) \| `null`&gt;

Verifies a JWT and returns its decoded claims, or null on ANY failure
(expired, tampered, wrong issuer/audience, malformed). Never throws.

#### Parameters

##### token

`string`

#### Returns

`Promise`&lt;[`JwtClaims`](JwtClaims.md) \| `null`&gt;
