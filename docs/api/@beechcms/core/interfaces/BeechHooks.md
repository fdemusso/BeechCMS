[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / BeechHooks

# Interface: BeechHooks

## Properties

### afterCreate?

> `optional` **afterCreate?**: (`entry`, `ctx`) => `void` \| `Promise`&lt;`void`&gt;

#### Parameters

##### entry

`Record`&lt;`string`, `any`&gt;

##### ctx

[`HookContext`](HookContext.md)

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### afterDelete?

> `optional` **afterDelete?**: (`id`, `ctx`) => `void` \| `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### ctx

[`HookContext`](HookContext.md)

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### afterUpdate?

> `optional` **afterUpdate?**: (`entry`, `ctx`) => `void` \| `Promise`&lt;`void`&gt;

#### Parameters

##### entry

`Record`&lt;`string`, `any`&gt;

##### ctx

[`HookContext`](HookContext.md)

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### beforeCreate?

> `optional` **beforeCreate?**: (`data`, `ctx`) => `void` \| `Record`&lt;`string`, `any`&gt; \| `Promise`&lt;`void` \| `Record`&lt;`string`, `any`&gt;&gt;

#### Parameters

##### data

`Record`&lt;`string`, `any`&gt;

##### ctx

[`HookContext`](HookContext.md)

#### Returns

`void` \| `Record`&lt;`string`, `any`&gt; \| `Promise`&lt;`void` \| `Record`&lt;`string`, `any`&gt;&gt;

***

### beforeDelete?

> `optional` **beforeDelete?**: (`id`, `ctx`) => `void` \| `Promise`&lt;`void`&gt;

#### Parameters

##### id

`string`

##### ctx

[`HookContext`](HookContext.md)

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### beforeUpdate?

> `optional` **beforeUpdate?**: (`id`, `patches`, `ctx`) => `void` \| `Record`&lt;`string`, `any`&gt; \| `Promise`&lt;`void` \| `Record`&lt;`string`, `any`&gt;&gt;

#### Parameters

##### id

`string`

##### patches

`Record`&lt;`string`, `any`&gt;

##### ctx

[`HookContext`](HookContext.md)

#### Returns

`void` \| `Record`&lt;`string`, `any`&gt; \| `Promise`&lt;`void` \| `Record`&lt;`string`, `any`&gt;&gt;
