[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / DeletionLedgerEvent

# Interface: DeletionLedgerEvent

The GDPR erasure record. It lives OUTSIDE D1 on purpose: a D1 Time Travel restore rewinds
every table it wrote, including any local ledger, which would defeat the one guarantee this
record exists to give — that an erasure stays erased.

## Properties

### actorId

> **actorId**: `string` \| `null`

Who ordered the purge. `null` for a system/reconciliation purge.

***

### entryId

> **entryId**: `string`

Entry id, the reconciliation key against a restored `content_{slug}` row.

***

### entrySlug

> **entrySlug**: `string` \| `null`

Entry slug at purge time. Diagnostic only; `entryId` is the identity.

***

### purgedAt

> **purgedAt**: `number`

Unix seconds (`IClock`), never `Date.now()`.

***

### reason

> **reason**: `"purge"` \| `"reconcile"`

'purge' = operator action; 'reconcile' = re-applied after a restore.

***

### seedSlug

> **seedSlug**: `string`

Seed slug the purged entry belonged to.
