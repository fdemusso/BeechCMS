[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / PurgeResult

# Interface: PurgeResult

Everything a purge caller needs to finish cleanup outside the database.

## Properties

### ledgerWritten

> **ledgerWritten**: `boolean`

True when a ledger event was appended. False only for a seed without `softDelete`.

***

### row

> **row**: `Record`&lt;`string`, `any`&gt;

The row as it existed immediately before erasure — the source of the R2 media keys.
