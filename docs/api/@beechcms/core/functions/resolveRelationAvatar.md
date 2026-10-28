[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveRelationAvatar

# Function: resolveRelationAvatar()

> **resolveRelationAvatar**(`branch`, `lookup`): [`Branch`](../interfaces/Branch.md) \| `null`

The target-seed branch that supplies a relation's avatar image, or `null` when the relation has no
avatar configured or the configuration no longer resolves (target gone, field renamed, retyped,
hidden). Callers treat `null` as "no avatar" — a stale `avatarSource` degrades, it never throws.

## Parameters

### branch

[`Branch`](../interfaces/Branch.md)

The relation branch carrying `avatarSource`.

### lookup

[`SeedLookup`](../type-aliases/SeedLookup.md)

Resolves the relation target.

## Returns

[`Branch`](../interfaces/Branch.md) \| `null`
