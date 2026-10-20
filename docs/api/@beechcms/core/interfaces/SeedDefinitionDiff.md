[**BeechCMS**](../../../index.md)

***

[BeechCMS](../../../index.md) / [@beechcms/core](../index.md) / SeedDefinitionDiff

# Interface: SeedDefinitionDiff

## Properties

### changed

> **changed**: `boolean`

True when the candidate's comparable definition differs from the stored one. Always true when nothing is stored.

***

### changedBranches

> **changedBranches**: `string`[]

Aliases, in candidate order, of candidate branches that are new (no stored branch with the same id) or whose
comparable definition differs from the stored branch with the same id. `[]` when nothing is stored.
