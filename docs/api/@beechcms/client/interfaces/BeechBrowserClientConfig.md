[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / BeechBrowserClientConfig

# Interface: BeechBrowserClientConfig

Browser client: read-only, authenticated with the publishable key (`beech_pk_…`).

## Extends

- [`BeechClientBaseConfig`](BeechClientBaseConfig.md)

## Properties

### baseUrl

> **baseUrl**: `string`

#### Inherited from

[`BeechClientBaseConfig`](BeechClientBaseConfig.md).[`baseUrl`](BeechClientBaseConfig.md#baseurl)

***

### fetch?

> `optional` **fetch?**: \{(`input`, `init?`): `Promise`&lt;`Response`&gt;; (`input`, `init?`): `Promise`&lt;`Response`&gt;; \}

#### Call Signature

> (`input`, `init?`): `Promise`&lt;`Response`&gt;

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`URL` \| `RequestInfo`

###### init?

`RequestInit`

##### Returns

`Promise`&lt;`Response`&gt;

#### Call Signature

> (`input`, `init?`): `Promise`&lt;`Response`&gt;

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Window/fetch)

##### Parameters

###### input

`string` \| `URL` \| `Request`

###### init?

`RequestInit`

##### Returns

`Promise`&lt;`Response`&gt;

#### Inherited from

[`BeechClientBaseConfig`](BeechClientBaseConfig.md).[`fetch`](BeechClientBaseConfig.md#fetch)

***

### headers?

> `optional` **headers?**: `Record`&lt;`string`, `string`&gt; \| `Headers`

#### Inherited from

[`BeechClientBaseConfig`](BeechClientBaseConfig.md).[`headers`](BeechClientBaseConfig.md#headers)

***

### publishableKey

> **publishableKey**: `string`
