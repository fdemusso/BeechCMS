[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / BeechServerClientConfig

# Interface: BeechServerClientConfig

Server client: reads and writes with one instance, authenticated with the secret key (`beech_sk_…`). Never ship it to a browser.

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

### secretKey

> **secretKey**: `string`
