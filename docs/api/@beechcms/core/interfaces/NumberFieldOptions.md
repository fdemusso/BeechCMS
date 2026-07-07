[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / NumberFieldOptions

# Interface: NumberFieldOptions

Specialized configuration for a branch of type 'number'.

## Properties

### control?

> `optional` **control?**: `"input"` \| `"slider"` \| `"rating"` \| `"stepper"`

Alternative input mechanism for the entry editor. Default: 'input'.

***

### currency?

> `optional` **currency?**: `string`

ISO 4217 currency code (required when format === 'currency'). E.g. 'EUR', 'USD'.

***

### decimals?

> `optional` **decimals?**: `number`

Explicit number of decimal digits to display and enforce.

***

### format?

> `optional` **format?**: `"decimal"` \| `"currency"` \| `"percentage"` \| `"compact"`

Visual display style. Default: 'decimal'.

***

### grouping?

> `optional` **grouping?**: `boolean`

Enable/disable thousands separator grouping. Default: true.

***

### max?

> `optional` **max?**: `number`

Maximum allowed value.

***

### min?

> `optional` **min?**: `number`

Minimum allowed value.

***

### prefix?

> `optional` **prefix?**: `string`

Custom text prepended to the formatted value.

***

### step?

> `optional` **step?**: `number`

Value increment (e.g. 1 for strict integers, 0.5 for half-steps).

***

### suffix?

> `optional` **suffix?**: `string`

Custom unit appended to the formatted value (e.g. 'kg', 'm²').
