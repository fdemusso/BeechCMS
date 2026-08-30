[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/forms-react](../index.md) / UseBeechFormReturn

# Interface: UseBeechFormReturn&lt;TValues&gt;

## Type Parameters

### TValues

`TValues` *extends* `Record`&lt;`string`, `unknown`&gt; = `Record`&lt;`string`, `unknown`&gt;

## Properties

### clearDraft

> **clearDraft**: () => `void`

#### Returns

`void`

***

### errors

> **errors**: `Record`&lt;`string`, `string` \| `undefined`&gt;

***

### handleFileChange

> **handleFileChange**: (`field`, `file`) => `Promise`&lt;`void`&gt;

#### Parameters

##### field

`string`

##### file

`File` \| `null`

#### Returns

`Promise`&lt;`void`&gt;

***

### handleSubmit

> **handleSubmit**: (`e?`) => `Promise`&lt;`boolean`&gt;

#### Parameters

##### e?

`FormEvent`&lt;`HTMLFormElement`&gt;

#### Returns

`Promise`&lt;`boolean`&gt;

***

### honeypotName

> **honeypotName**: `string`

***

### honeypotValue

> **honeypotValue**: `string`

***

### isDraftRestored

> **isDraftRestored**: `boolean`

***

### isFieldVisible

> **isFieldVisible**: (`field`) => `boolean`

#### Parameters

##### field

`string`

#### Returns

`boolean`

***

### isLoadingSchema

> **isLoadingSchema**: `boolean`

***

### isSubmitting

> **isSubmitting**: `boolean`

***

### isSuccess

> **isSuccess**: `boolean`

***

### register

> **register**: (`field`) => `object`

#### Parameters

##### field

`string`

#### Returns

`object`

##### aria-describedby?

> `optional` **aria-describedby?**: `string`

##### aria-invalid?

> `optional` **aria-invalid?**: `boolean`

##### aria-required?

> `optional` **aria-required?**: `boolean`

##### name

> **name**: `string`

##### onBlur

> **onBlur**: () => `void`

###### Returns

`void`

##### onChange

> **onChange**: (`e`) => `void`

###### Parameters

###### e

`ChangeEvent`&lt;`HTMLInputElement` \| `HTMLTextAreaElement` \| `HTMLSelectElement`&gt;

###### Returns

`void`

##### value

> **value**: `string` \| `number` \| readonly `string`[] \| `undefined`

***

### registerHoneypot

> **registerHoneypot**: () => `object`

#### Returns

`object`

##### aria-hidden

> **aria-hidden**: `boolean`

##### autoComplete

> **autoComplete**: `string`

##### name

> **name**: `string`

##### onChange

> **onChange**: (`e`) => `void`

###### Parameters

###### e

`ChangeEvent`&lt;`HTMLInputElement`&gt;

###### Returns

`void`

##### tabIndex

> **tabIndex**: `number`

##### value

> **value**: `string`

***

### reset

> **reset**: () => `void`

#### Returns

`void`

***

### schema

> **schema**: [`FormSeedSchema`](FormSeedSchema.md) \| `null`

***

### seedSlug

> **seedSlug**: `string`

***

### serverError

> **serverError**: `string` \| `null`

***

### setFieldError

> **setFieldError**: (`field`, `error?`) => `void`

#### Parameters

##### field

`string`

##### error?

`string`

#### Returns

`void`

***

### setFieldTouched

> **setFieldTouched**: (`field`, `isTouched?`) => `void`

#### Parameters

##### field

`string`

##### isTouched?

`boolean`

#### Returns

`void`

***

### setFieldValue

> **setFieldValue**: (`field`, `value`) => `void`

#### Parameters

##### field

`string`

##### value

`unknown`

#### Returns

`void`

***

### setHoneypotValue

> **setHoneypotValue**: (`value`) => `void`

#### Parameters

##### value

`string`

#### Returns

`void`

***

### timeTrapReady

> **timeTrapReady**: `boolean`

***

### touched

> **touched**: `Record`&lt;`string`, `boolean` \| `undefined`&gt;

***

### translations

> **translations**: [`FormTranslations`](FormTranslations.md)

***

### values

> **values**: `TValues`
