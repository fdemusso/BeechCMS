[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / ValidateSeedPayloadOptions

# Interface: ValidateSeedPayloadOptions

Options to configure the validation and sanitization behavior of the seed payload.

## Properties

### allowNull?

> `optional` **allowNull?**: `boolean`

Whether to allow fields to be explicitly `null`.

#### Default

```ts
false
```

***

### enforceRequiredFields?

> `optional` **enforceRequiredFields?**: `boolean`

Whether to enforce validation of required fields (`requiredOnCreate` or `requiredOnUpdate`).

#### Default

```ts
true
```

***

### idGenerator?

> `optional` **idGenerator?**: [`IIdGenerator`](IIdGenerator.md)

Required when the seed has branches of type `'relation'`.
Must be the same `IIdGenerator` instance used for id generation so that
swapping implementations (e.g. ULIDs) automatically updates validation.
Do NOT pass a concrete class — inject via the middleware / factory.

***

### maxTextLength?

> `optional` **maxTextLength?**: `number`

The maximum allowed length (in characters/bytes) for text and rich text fields.

#### Default

```ts
50000
```

***

### operation?

> `optional` **operation?**: `"create"` \| `"update"`

The type of operation being validated, which determines whether `requiredOnCreate`
or `requiredOnUpdate` branch constraints are applied.

#### Default

```ts
'create'
```

***

### requireAtLeastOneValidField?

> `optional` **requireAtLeastOneValidField?**: `boolean`

If true, validation will fail if the resulting data payload contains no valid fields.

#### Default

```ts
true
```
