[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / ISiteSettingsRepository

# Interface: ISiteSettingsRepository

## Methods

### getAll()

> **getAll**(): `Promise`&lt;[`SiteSettings`](SiteSettings.md)&gt;

Returns all stored settings, applying sensible defaults for missing keys.

#### Returns

`Promise`&lt;[`SiteSettings`](SiteSettings.md)&gt;

***

### setMany()

> **setMany**(`values`): `Promise`&lt;`void`&gt;

Upserts the provided keys. Partial update — unspecified keys are untouched.

#### Parameters

##### values

`Partial`&lt;[`SiteSettings`](SiteSettings.md)&gt;

#### Returns

`Promise`&lt;`void`&gt;
