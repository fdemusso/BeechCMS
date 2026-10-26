[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PurgeOptions

# Interface: PurgeOptions

Options for `purge`.

## Extends

- [`RepositoryOptions`](RepositoryOptions.md)

## Properties

### actor?

> `optional` **actor?**: `object`

#### email?

> `optional` **email?**: `string`

#### id

> **id**: `string`

#### role?

> `optional` **role?**: `string`

#### Inherited from

[`RepositoryOptions`](RepositoryOptions.md).[`actor`](RepositoryOptions.md#actor)

***

### ifMatch?

> `optional` **ifMatch?**: `number`

Optimistic concurrency guard for `update`: the `updated_at` the caller last read.
When set, the write only applies if the live row's `updated_at` still matches;
otherwise `update` throws [EntryConflictError](../classes/EntryConflictError.md).

#### Inherited from

[`RepositoryOptions`](RepositoryOptions.md).[`ifMatch`](RepositoryOptions.md#ifmatch)

***

### trashed?

> `optional` **trashed?**: `"any"` \| `"trashed"`

Which rows the purge may erase. Default `'trashed'`: an ordinary purge only ever erases an entry
already in the Trash. `'any'` is reserved for ledger reconciliation, which must re-erase a row a
database restore resurrected as live.
