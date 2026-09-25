[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / RepositoryOptions

# Interface: RepositoryOptions

Options passed to write operations. Currently carries the acting user
(extracted from the JWT) so lifecycle hooks can attribute changes.

## Properties

### actor?

> `optional` **actor?**: `object`

#### email?

> `optional` **email?**: `string`

#### id

> **id**: `string`

#### role?

> `optional` **role?**: `string`

***

### ifMatch?

> `optional` **ifMatch?**: `number`

Optimistic concurrency guard for `update`: the `updated_at` the caller last read.
When set, the write only applies if the live row's `updated_at` still matches;
otherwise `update` throws [EntryConflictError](../classes/EntryConflictError.md).
