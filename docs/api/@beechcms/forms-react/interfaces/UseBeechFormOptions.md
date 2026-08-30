[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/forms-react](../index.md) / UseBeechFormOptions

# Interface: UseBeechFormOptions&lt;TValues&gt;

## Extended by

- [`BeechFormProps`](BeechFormProps.md)

## Type Parameters

### TValues

`TValues` *extends* `Record`&lt;`string`, `unknown`&gt; = `Record`&lt;`string`, `unknown`&gt;

## Properties

### apiKey?

> `optional` **apiKey?**: `string`

***

### baseUrl?

> `optional` **baseUrl?**: `string`

***

### disableAntiBot?

> `optional` **disableAntiBot?**: `boolean`

***

### disableDraft?

> `optional` **disableDraft?**: `boolean`

***

### excludeFields?

> `optional` **excludeFields?**: `string`[]

***

### honeypotField?

> `optional` **honeypotField?**: `string`

***

### includeFields?

> `optional` **includeFields?**: `string`[]

***

### initialValues?

> `optional` **initialValues?**: `Partial`&lt;`TValues`&gt;

***

### locale?

> `optional` **locale?**: [`Locale`](../type-aliases/Locale.md)

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

***

### seed

> **seed**: `string` \| [`FormSeedSchema`](FormSeedSchema.md)

***

### translations?

> `optional` **translations?**: `Partial`&lt;[`FormTranslations`](FormTranslations.md)&gt;
