[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveRetentionDays

# Function: resolveRetentionDays()

> **resolveRetentionDays**(`seed`, `globalRetentionDays`): `number`

Effective retention for one seed: the seed's own `retentionDays` when it is a number (including 0),
otherwise `globalRetentionDays`. `0` = never purge. Pure; never throws.

## Parameters

### seed

`Pick`&lt;[`Seed`](../interfaces/Seed.md), `"retentionDays"`&gt;

### globalRetentionDays

`number`

## Returns

`number`
