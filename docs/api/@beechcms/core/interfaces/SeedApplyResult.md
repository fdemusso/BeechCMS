[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SeedApplyResult

# Interface: SeedApplyResult

## Properties

### applied

> **applied**: `boolean`

false when the CAS guard did not match — nothing was written.

***

### version

> **version**: `number`

The version now in D1: expectedVersion + 1 on success, the live value on conflict.
