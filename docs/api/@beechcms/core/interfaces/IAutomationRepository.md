[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / IAutomationRepository

# Interface: IAutomationRepository

## Methods

### create()

> **create**(`input`): `Promise`&lt;`string`&gt;

#### Parameters

##### input

[`CreateAutomationInput`](CreateAutomationInput.md)

#### Returns

`Promise`&lt;`string`&gt;

***

### delete()

> **delete**(`id`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

#### Returns

`Promise`&lt;`void`&gt;

***

### findActive()

> **findActive**(`seedSlug`, `event`): `Promise`&lt;[`Automation`](Automation.md)[]&gt;

#### Parameters

##### seedSlug

`string`

##### event

[`AutomationTriggerEvent`](../type-aliases/AutomationTriggerEvent.md)

#### Returns

`Promise`&lt;[`Automation`](Automation.md)[]&gt;

***

### findById()

> **findById**(`id`): `Promise`&lt;[`Automation`](Automation.md) \| `null`&gt;

#### Parameters

##### id

`string`

#### Returns

`Promise`&lt;[`Automation`](Automation.md) \| `null`&gt;

***

### list()

> **list**(`seedSlug`): `Promise`&lt;[`Automation`](Automation.md)[]&gt;

#### Parameters

##### seedSlug

`string`

#### Returns

`Promise`&lt;[`Automation`](Automation.md)[]&gt;

***

### toggle()

> **toggle**(`id`, `enabled`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### enabled

`boolean`

#### Returns

`Promise`&lt;`void`&gt;

***

### update()

> **update**(`id`, `input`): `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### input

[`UpdateAutomationInput`](../type-aliases/UpdateAutomationInput.md)

#### Returns

`Promise`&lt;`void`&gt;
