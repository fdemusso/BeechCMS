[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/client](../index.md) / BeechClientConfig

# Interface: BeechClientConfig

## Properties

### apiKey

> **apiKey**: `string`

***

### baseUrl

> **baseUrl**: `string`

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

***

### headers?

> `optional` **headers?**: `Record`&lt;`string`, `string`&gt; \| `Headers`
