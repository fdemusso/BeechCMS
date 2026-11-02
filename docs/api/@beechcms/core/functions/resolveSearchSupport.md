[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / resolveSearchSupport

# Function: resolveSearchSupport()

> **resolveSearchSupport**(`seed`, `lookup?`): [`SearchSupport`](../type-aliases/SearchSupport.md)

Decides how `seed` can be searched. FTS wins when available; otherwise a single relation
display name is searched through the target's display name, provided that column is plain,
unlocalized, unencrypted text.

## Parameters

### seed

[`Seed`](../interfaces/Seed.md)

The seed being listed.

### lookup?

[`SeedLookup`](../type-aliases/SeedLookup.md)

Resolves relation targets; without it the relation mode is never chosen.

## Returns

[`SearchSupport`](../type-aliases/SearchSupport.md)
