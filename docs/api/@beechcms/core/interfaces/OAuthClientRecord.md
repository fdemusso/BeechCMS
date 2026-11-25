[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / OAuthClientRecord

# Interface: OAuthClientRecord

## Properties

### allowedScopes

> **allowedScopes**: (`"content:read"` \| `"content:delete"` \| `"schema:read"` \| `"schema:write"` \| `"content:write"` \| `"media:read"` \| `"media:write"` \| `"automations:read"` \| `"automations:write"` \| `"users:read"` \| `"users:write"` \| `"settings:read"` \| `"settings:write"` \| `"analytics:read"` \| `"agent:read"` \| `"agent:approve"`)[]

***

### clientId

> **clientId**: `string`

***

### createdAt

> **createdAt**: `number`

***

### disabledAt

> **disabledAt**: `number` \| `null`

***

### isPublic

> **isPublic**: `boolean`

True for clients that cannot hold a secret (native/CLI). PKCE is required regardless.

***

### name

> **name**: `string`

***

### redirectUris

> **redirectUris**: `string`[]

Registered redirect URIs. Loopback entries are matched ignoring the port.
