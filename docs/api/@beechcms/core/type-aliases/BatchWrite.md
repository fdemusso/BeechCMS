[**BeechCMS**](../../../README.md)

***

[BeechCMS](../../../README.md) / [@beechcms/core](../README.md) / BatchWrite

# Type Alias: BatchWrite

> **BatchWrite** = \{ `data`: `Record`&lt;`string`, `any`&gt;; `id`: `string`; `kind`: `"create"`; `seed`: [`Seed`](../interfaces/Seed.md); `slug`: `string`; `status`: `string`; \} \| \{ `data`: `Record`&lt;`string`, `any`&gt;; `id`: `string`; `kind`: `"update"`; `seed`: [`Seed`](../interfaces/Seed.md); `status?`: `string`; \} \| \{ `fieldName`: `string`; `id`: `string`; `kind`: `"mutateField"`; `operation`: \{ `type`: `"increment"` \| `"decrement"`; `value`: `number`; \}; `options?`: \{ `max?`: `number`; `min?`: `number`; \}; `seed`: [`Seed`](../interfaces/Seed.md); \}

Declarative multi-write operation translated into a single `db.batch` call.
Used for coordinated writes across one or more seeds when D1's lack of
interactive transactions makes a callback-based API impossible.

NOTE: document-level lifecycle hooks do NOT run for operations inside a
`runBatch` call — they would be non-atomic side-effects.
