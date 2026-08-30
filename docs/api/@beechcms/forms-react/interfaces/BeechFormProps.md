[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/forms-react](../index.md) / BeechFormProps

# Interface: BeechFormProps&lt;TValues&gt;

## Extends

- [`UseBeechFormOptions`](UseBeechFormOptions.md)&lt;`TValues`&gt;

## Type Parameters

### TValues

`TValues` *extends* `Record`&lt;`string`, `unknown`&gt; = `Record`&lt;`string`, `unknown`&gt;

## Properties

### apiKey?

> `optional` **apiKey?**: `string`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`apiKey`](UseBeechFormOptions.md#apikey)

***

### baseUrl?

> `optional` **baseUrl?**: `string`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`baseUrl`](UseBeechFormOptions.md#baseurl)

***

### children?

> `optional` **children?**: `ReactNode` \| ((`form`) => `ReactNode`)

***

### className?

> `optional` **className?**: `string`

***

### disableAntiBot?

> `optional` **disableAntiBot?**: `boolean`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`disableAntiBot`](UseBeechFormOptions.md#disableantibot)

***

### disableDraft?

> `optional` **disableDraft?**: `boolean`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`disableDraft`](UseBeechFormOptions.md#disabledraft)

***

### excludeFields?

> `optional` **excludeFields?**: `string`[]

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`excludeFields`](UseBeechFormOptions.md#excludefields)

***

### honeypotField?

> `optional` **honeypotField?**: `string`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`honeypotField`](UseBeechFormOptions.md#honeypotfield)

***

### includeFields?

> `optional` **includeFields?**: `string`[]

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`includeFields`](UseBeechFormOptions.md#includefields)

***

### initialValues?

> `optional` **initialValues?**: `Partial`&lt;`TValues`&gt;

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`initialValues`](UseBeechFormOptions.md#initialvalues)

***

### locale?

> `optional` **locale?**: [`Locale`](../type-aliases/Locale.md)

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`locale`](UseBeechFormOptions.md#locale)

***

### onError?

> `optional` **onError?**: (`error`) => `void`

#### Parameters

##### error

###### details?

`unknown`

###### message

`string`

###### status

`number`

#### Returns

`void`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`onError`](UseBeechFormOptions.md#onerror)

***

### onSuccess?

> `optional` **onSuccess?**: (`result`) => `void`

#### Parameters

##### result

###### data

`TValues`

###### id?

`string`

#### Returns

`void`

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`onSuccess`](UseBeechFormOptions.md#onsuccess)

***

### seed

> **seed**: `string` \| [`FormSeedSchema`](FormSeedSchema.md)

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`seed`](UseBeechFormOptions.md#seed)

***

### translations?

> `optional` **translations?**: `Partial`&lt;[`FormTranslations`](FormTranslations.md)&gt;

#### Inherited from

[`UseBeechFormOptions`](UseBeechFormOptions.md).[`translations`](UseBeechFormOptions.md#translations)
